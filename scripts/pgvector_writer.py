import os
import hashlib
from datetime import datetime
from typing import List, Dict, Optional
import psycopg2
from psycopg2.extras import execute_values
from pgvector.psycopg2 import register_vector
from scripts.config import get_config


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
        if not self.db_url:
            raise ValueError("DATABASE_URL environment variable or postgresql.url config is required")

        self.collection_name = config.postgresql.get("collection", "loggix_knowledge")
        self._register_vector()
        self._ensure_table()

    def _get_conn(self):
        conn = psycopg2.connect(self.db_url)
        register_vector(conn)
        return conn

    def _register_vector(self):
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            conn.commit()
        finally:
            conn.close()

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
                    embedding vector(1536)
                )
            """)
            cur.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{self.collection_name}_doc_id
                ON {self.collection_name}(doc_id)
            """)
            try:
                cur.execute(f"""
                    CREATE INDEX IF NOT EXISTS idx_{self.collection_name}_embedding
                    ON {self.collection_name} USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = 100)
                """)
            except Exception:
                pass
            conn.commit()
        finally:
            conn.close()

    def _compute_hash(self, text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()[:16]

    def upsert_chunks(self, doc_chunks: List[Dict], embeddings: List[List[float]]) -> int:
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
                embedding
            ))

        conn = self._get_conn()
        try:
            cur = conn.cursor()
            execute_values(cur, f"""
                INSERT INTO {self.collection_name}
                (chunk_id, text, doc_id, doc_type, source_path, file_hash,
                 chunk_index, total_chunks, section, subsection, heading_level,
                 page, tags, keywords, summary, ingested_at, version, embedding)
                VALUES %s
                ON CONFLICT (chunk_id) DO UPDATE SET
                    text = EXCLUDED.text,
                    doc_id = EXCLUDED.doc_id,
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

    def delete_document(self, doc_id: str) -> int:
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            cur.execute(f"DELETE FROM {self.collection_name} WHERE doc_id = %s", (doc_id,))
            count = cur.rowcount
            conn.commit()
            return count
        finally:
            conn.close()

    def get_document_info(self, doc_id: str) -> Optional[Dict]:
        conn = self._get_conn()
        try:
            cur = conn.cursor()
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

    def list_documents(self) -> List[Dict]:
        conn = self._get_conn()
        try:
            cur = conn.cursor()
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
        conn = self._get_conn()
        try:
            cur = conn.cursor()

            where_clause = ""
            params = [query_embedding]

            if where and "doc_id" in where:
                where_clause = "WHERE doc_id = %s"
                params.append(where["doc_id"])

            limit = min(n_results, 100)
            params.append(limit)

            cur.execute(f"""
                SELECT chunk_id, text, doc_id, doc_type, section, subsection,
                       heading_level, page, tags, keywords, summary,
                       1 - (embedding <=> %s::vector) AS distance
                FROM {self.collection_name}
                {where_clause}
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, params)

            rows = cur.fetchall()

            ids = []
            documents = []
            metadatas = []
            distances = []

            for row in rows:
                ids.append(row[0])
                documents.append(row[1])
                metadatas.append({
                    "chunk_id": row[0],
                    "doc_id": row[2],
                    "doc_type": row[3] or "",
                    "section": row[4] or "",
                    "subsection": row[5] or "",
                    "heading_level": row[6] or 0,
                    "page": row[7] or "",
                    "tags": row[8] or "",
                    "keywords": row[9] or "",
                    "summary": row[10] or "",
                    "distance": 1 - row[11] if row[11] is not None else 1.0
                })
                distances.append(row[11] if row[11] is not None else 0.0)

            return {
                "ids": [ids],
                "documents": [documents],
                "metadatas": [metadatas],
                "distances": [distances]
            }
        finally:
            conn.close()

    def clear_all(self):
        conn = self._get_conn()
        try:
            cur = conn.cursor()
            cur.execute(f"DELETE FROM {self.collection_name}")
            conn.commit()
        finally:
            conn.close()
