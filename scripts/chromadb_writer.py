import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
import chromadb
from chromadb.config import Settings
from scripts.config import get_config


class ChromaDBWriter:
    SCHEMA_FIELDS = [
        "text", "doc_id", "doc_type", "source_path", "file_hash",
        "chunk_index", "chunk_id", "total_chunks", "section", "subsection",
        "heading_level", "page", "tags", "keywords", "summary",
        "ingested_at", "version"
    ]

    def __init__(self, config=None):
        if config is None:
            config = get_config()
        self.chroma_path = config.chromadb["path"]
        self.collection_name = config.chromadb["collection"]

        self.client = chromadb.PersistentClient(
            path=str(Path(__file__).parent.parent / self.chroma_path),
            settings=Settings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": config.chromadb.get("distance", "cosine")}
        )

    def _compute_hash(self, text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()[:16]

    def upsert_chunks(self, doc_chunks: List[Dict], embeddings: List[List[float]]) -> int:
        if not doc_chunks or not embeddings:
            return 0

        ids = []
        documents = []
        metadatas = []

        for i, (chunk, embedding) in enumerate(zip(doc_chunks, embeddings)):
            chunk_id = f"{chunk.get('doc_id', 'unknown')}_chunk_{chunk.get('chunk_index', i):04d}"

            metadata = chunk.get("metadata", {}).copy()
            metadata.update({
                "doc_id": chunk.get("doc_id", ""),
                "doc_type": chunk.get("doc_type", "document"),
                "source_path": chunk.get("source_path", ""),
                "file_hash": chunk.get("file_hash", ""),
                "chunk_index": chunk.get("chunk_index", i),
                "chunk_id": chunk_id,
                "total_chunks": chunk.get("total_chunks", 1),
                "section": chunk.get("section", ""),
                "subsection": chunk.get("subsection", ""),
                "heading_level": chunk.get("heading_level", 0),
                "page": chunk.get("page") or "",
                "tags": metadata.get("tags", ""),
                "keywords": metadata.get("keywords", ""),
                "summary": metadata.get("summary", ""),
                "ingested_at": datetime.utcnow().isoformat(),
                "version": chunk.get("version", 1)
            })

            metadata = {k: v for k, v in metadata.items() if v is not None and isinstance(v, (str, int, float, bool))}

            ids.append(chunk_id)
            documents.append(chunk["text"])
            metadatas.append(metadata)

        self.collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings
        )

        return len(ids)

    def delete_document(self, doc_id: str) -> int:
        results = self.collection.get(where={"doc_id": doc_id})
        if results and results["ids"]:
            self.collection.delete(ids=results["ids"])
            return len(results["ids"])
        return 0

    def get_document_info(self, doc_id: str) -> Optional[Dict]:
        results = self.collection.get(where={"doc_id": doc_id})
        if not results or not results["ids"]:
            return None

        chunks = results["documents"]
        metadatas = results["metadatas"]

        sections = set()
        tags = set()
        for meta in metadatas:
            if meta.get("section"):
                sections.add(meta["section"])
            if meta.get("tags"):
                tags.update(meta["tags"].split(","))

        return {
            "doc_id": doc_id,
            "chunk_count": len(chunks),
            "sections": list(sections),
            "tags": list(tags),
            "source_path": metadatas[0].get("source_path", "") if metadatas else "",
            "doc_type": metadatas[0].get("doc_type", "") if metadatas else "",
            "total_chunks": len(chunks)
        }

    def list_documents(self) -> List[Dict]:
        results = self.collection.get()
        if not results or not results["ids"]:
            return []

        doc_ids = set()
        for meta in results.get("metadatas", []):
            if meta and meta.get("doc_id"):
                doc_ids.add(meta["doc_id"])

        docs_info = []
        for doc_id in sorted(doc_ids):
            info = self.get_document_info(doc_id)
            if info:
                docs_info.append(info)

        return docs_info

    def get_all_texts(self) -> List[Dict]:
        results = self.collection.get()
        chunks = []

        if results and results["documents"]:
            for i, doc in enumerate(results["documents"]):
                meta = results["metadatas"][i] if i < len(results["metadatas"]) else {}
                chunks.append({
                    "text": doc,
                    "chunk_id": meta.get("chunk_id", ""),
                    "doc_id": meta.get("doc_id", ""),
                    "section": meta.get("section", ""),
                    "subsection": meta.get("subsection", ""),
                    "metadata": meta
                })

        return chunks

    def query(self, query_embedding: List[float], n_results: int = 10, where: Dict = None) -> Dict:
        return self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where
        )

    def clear_all(self):
        self.client.delete_collection(self.collection_name)
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"}
        )
