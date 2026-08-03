import os
import json
import hashlib
import math
from datetime import datetime
from typing import List, Dict, Optional
import psycopg2
from psycopg2.extras import execute_values
from scripts.config import get_config


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class PGVectorWriter:
    SCHEMA_FIELDS = [
        "text", "doc_id", "doc_type", "source_path", "file_hash",
        "chunk_index", "chunk_id", "total_chunks", "section", "subsection",
        "heading_level", "page", "tags", "keywords", "summary",
        "ingested_at", "version"
    ]

    def __init__(self, config=None):
        if config is None:
            config = get_config()

        self.db_url = os.getenv("DATABASE_URL") or config.postgresql.get("url", "")
        self.collection_name = config.postgresql.get("collection", "loggix_knowledge")
        self._initialized = False

    def _get_conn(self):
        if not self.db_url:
            raise ValueError("DATABASE_URL environment variable is required")
        url = self.db_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if "?" not in url:
            url += "?sslmode=require"
        elif "sslmode" not in url:
            url += "&sslmode=require"
        return psycopg2.connect(url)

    def _ensure_initialized(self):
        if self._initialized:
            return
        if not self.db_url:
            raise ValueError("DATABASE_URL environment variable is required")
        self._ensure_table()
        self._initialized = True

    def _ensure_table(self):
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {self.collection_name} (
                    id SERIAL PRIMARY KEY,
                    chunk_id VARCHAR(128) UNIQUE NOT NULL,
                    text TEXT NOT NULL,
                    doc_id VARCHAR(128) NOT NULL,
                    tenant_id VARCHAR(36) DEFAULT '',
                    doc_type VARCHAR(32),
                    source_path TEXT,
                    file_hash VARCHAR(64),
                    chunk_index INTEGER,
                    total_chunks INTEGER,
                    section TEXT,
                    subsection TEXT,
                    heading_level INTEGER,
                    page TEXT,
                    tags TEXT,
                    keywords TEXT,
                    summary TEXT,
                    ingested_at TIMESTAMP DEFAULT NOW(),
                    version INTEGER DEFAULT 1,
                    embedding TEXT
                )
            """)
            cur.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{self.collection_name}_tenant_id
                ON {self.collection_name}(tenant_id)
            """)
            cur.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{self.collection_name}_doc_id
                ON {self.collection_name}(doc_id)
            """)
            conn.commit()
        finally:
            conn.close()

    def _compute_hash(self, text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()[:16]

    def upsert_chunks(self, doc_chunks: List[Dict], embeddings: List[List[float]]) -> int:
        self._ensure_initialized()
        if not doc_chunks or not embeddings:
            return 0

        rows = []
        for i, (chunk, embedding) in enumerate(zip(doc_chunks, embeddings)):
            chunk_id = f"{chunk.get('doc_id', 'unknown')}_chunk_{chunk.get('chunk_index', i):04d}"
            metadata = chunk.get("metadata", {}).copy()

            rows.append((
                chunk_id,
                chunk["text"],
                chunk.get("doc_id", ""),
                chunk.get("tenant_id", ""),
                chunk.get("doc_type", "document"),
                chunk.get("source_path", ""),
                chunk.get("file_hash", ""),
                chunk.get("chunk_index", i),
                chunk.get("total_chunks", 1),
                chunk.get("section", ""),
                chunk.get("subsection", ""),
                chunk.get("heading_level", 0),
                str(chunk.get("page") or ""),
                metadata.get("tags", ""),
                metadata.get("keywords", ""),
                metadata.get("summary", ""),
                datetime.utcnow(),
                chunk.get("version", 1),
                json.dumps(embedding)
            ))

        conn = self._get_conn()
        try:
            cur = conn.cursor()
            execute_values(cur, f"""
                INSERT INTO {self.collection_name}
                (chunk_id, text, doc_id, tenant_id, doc_type, source_path, file_hash,
                 chunk_index, total_chunks, section, subsection, heading_level,
                 page, tags, keywords, summary, ingested_at, version, embedding)
                VALUES %s
                ON CONFLICT (chunk_id) DO UPDATE SET
                    text = EXCLUDED.text,
                    doc_id = EXCLUDED.doc_id,
                    tenant_id = EXCLUDED.tenant_id,
                    doc_type = EXCLUDED.doc_type,
                    source_path = EXCLUDED.source_path,
                    file_hash = EXCLUDED.file_hash,
                    chunk_index = EXCLUDED.chunk_index,
                    total_chunks = EXCLUDED.total_chunks,
                    section = EXCLUDED.section,
                    subsection = EXCLUDED.subsection,
                    heading_level = EXCLUDED.heading_level,
                    page = EXCLUDED.page,
                    tags = EXCLUDED.tags,
                    keywords = EXCLUDED.keywords,
                    summary = EXCLUDED.summary,
                    ingested_at = EXCLUDED.ingested_at,
                    version = EXCLUDED.version,
                    embedding = EXCLUDED.embedding
            """, rows)
            conn.commit()
            return len(rows)
        finally:
            conn.close()

    def delete_document(self, doc_id: str, tenant_id: str = "") -> int:
        self._ensure_initialized()
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            if tenant_id:
                cur.execute(f"DELETE FROM {self.collection_name} WHERE doc_id = %s AND tenant_id = %s", (doc_id, tenant_id))
            else:
                cur.execute(f"DELETE FROM {self.collection_name} WHERE doc_id = %s", (doc_id,))
            count = cur.rowcount
            conn.commit()
            return count
        finally:
            conn.close()

    def get_document_info(self, doc_id: str, tenant_id: str = "") -> Optional[Dict]:
        self._ensure_initialized()
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            if tenant_id:
                cur.execute(f"""
                    SELECT doc_type, source_path, section, tags, COUNT(*) as chunk_count
                    FROM {self.collection_name}
                    WHERE doc_id = %s AND tenant_id = %s
                    GROUP BY doc_type, source_path, section, tags
                """, (doc_id, tenant_id))
            else:
                cur.execute(f"""
                    SELECT doc_type, source_path, section, tags, COUNT(*) as chunk_count
                    FROM {self.collection_name}
                    WHERE doc_id = %s
                    GROUP BY doc_type, source_path, section, tags
                """, (doc_id,))
            rows = cur.fetchall()

            if not rows:
                return None

            sections = set()
            tags = set()
            for row in rows:
                if row[2]:
                    sections.add(row[2])
                if row[3]:
                    tags.update(row[3].split(","))

            return {
                "doc_id": doc_id,
                "chunk_count": sum(r[4] for r in rows),
                "sections": list(sections),
                "tags": list(tags),
                "source_path": rows[0][1] or "",
                "doc_type": rows[0][0] or "",
                "total_chunks": sum(r[4] for r in rows)
            }
        finally:
            conn.close()

    def list_documents(self, tenant_id: str = "") -> List[Dict]:
        self._ensure_initialized()
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            if tenant_id:
                cur.execute(f"""
                    SELECT doc_id, doc_type, source_path, section, tags, COUNT(*) as chunk_count
                    FROM {self.collection_name}
                    WHERE tenant_id = %s
                    GROUP BY doc_id, doc_type, source_path, section, tags
                    ORDER BY doc_id
                """, (tenant_id,))
            else:
                cur.execute(f"""
                    SELECT doc_id, doc_type, source_path, section, tags, COUNT(*) as chunk_count
                    FROM {self.collection_name}
                    GROUP BY doc_id, doc_type, source_path, section, tags
                    ORDER BY doc_id
                """)
            rows = cur.fetchall()

            doc_map = {}
            for row in rows:
                doc_id = row[0]
                if doc_id not in doc_map:
                    doc_map[doc_id] = {
                        "doc_id": doc_id,
                        "doc_type": row[1] or "",
                        "source_path": row[2] or "",
                        "sections": set(),
                        "tags": set(),
                        "chunk_count": 0
                    }
                if row[3]:
                    doc_map[doc_id]["sections"].add(row[3])
                if row[4]:
                    doc_map[doc_id]["tags"].update(row[4].split(","))
                doc_map[doc_id]["chunk_count"] += row[5]

            result = []
            for doc in doc_map.values():
                doc["sections"] = list(doc["sections"])
                doc["tags"] = list(doc["tags"])
                result.append(doc)
            return result
        finally:
            conn.close()

    def get_all_texts(self) -> List[Dict]:
        self._ensure_initialized()
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            cur.execute(f"""
                SELECT text, chunk_id, doc_id, section, subsection
                FROM {self.collection_name}
            """)
            rows = cur.fetchall()
            return [
                {
                    "text": r[0],
                    "chunk_id": r[1],
                    "doc_id": r[2],
                    "section": r[3] or "",
                    "subsection": r[4] or "",
                    "metadata": {}
                }
                for r in rows
            ]
        finally:
            conn.close()

    def query(self, query_embedding: List[float], n_results: int = 10, where: Dict = None) -> Dict:
        self._ensure_initialized()
        conn = self._get_conn()
        try:
            cur = conn.cursor()

            conditions = []
            params = []
            if where:
                if "doc_id" in where:
                    conditions.append("doc_id = %s")
                    params.append(where["doc_id"])
                if "tenant_id" in where:
                    conditions.append("tenant_id = %s")
                    params.append(where["tenant_id"])

            if conditions:
                cur.execute(f"""
                    SELECT chunk_id, text, doc_id, doc_type, section, subsection,
                           heading_level, page, tags, keywords, summary, embedding
                    FROM {self.collection_name}
                    WHERE {" AND ".join(conditions)}
                """, tuple(params))
            else:
                cur.execute(f"""
                    SELECT chunk_id, text, doc_id, doc_type, section, subsection,
                           heading_level, page, tags, keywords, summary, embedding
                    FROM {self.collection_name}
                """)

            rows = cur.fetchall()

            scored = []
            for row in rows:
                embedding_str = row[11]
                if not embedding_str:
                    continue
                try:
                    stored_embedding = json.loads(embedding_str)
                    similarity = _cosine_similarity(query_embedding, stored_embedding)
                except (json.JSONDecodeError, TypeError):
                    similarity = 0.0

                scored.append({
                    "chunk_id": row[0],
                    "text": row[1],
                    "doc_id": row[2],
                    "doc_type": row[3] or "",
                    "section": row[4] or "",
                    "subsection": row[5] or "",
                    "heading_level": row[6] or 0,
                    "page": row[7] or "",
                    "tags": row[8] or "",
                    "keywords": row[9] or "",
                    "summary": row[10] or "",
                    "similarity": similarity
                })

            scored.sort(key=lambda x: x["similarity"], reverse=True)
            top = scored[:n_results]

            ids = [r["chunk_id"] for r in top]
            documents = [r["text"] for r in top]
            metadatas = []
            for r in top:
                metadatas.append({
                    "chunk_id": r["chunk_id"],
                    "doc_id": r["doc_id"],
                    "doc_type": r["doc_type"],
                    "section": r["section"],
                    "subsection": r["subsection"],
                    "heading_level": r["heading_level"],
                    "page": r["page"],
                    "tags": r["tags"],
                    "keywords": r["keywords"],
                    "summary": r["summary"],
                    "distance": 1 - r["similarity"]
                })
            distances = [1 - r["similarity"] for r in top]

            return {
                "ids": [ids],
                "documents": [documents],
                "metadatas": [metadatas],
                "distances": [distances]
            }
        finally:
            conn.close()

    def clear_all(self):
        self._ensure_initialized()
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            cur.execute(f"DELETE FROM {self.collection_name}")
            conn.commit()
        finally:
            conn.close()
