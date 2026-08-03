import os
import sys
import hashlib
import asyncio
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.config import get_config
from scripts.extractors import ExtractorRegistry, DocumentChunk
from scripts.chunker import HeadingAwareChunker as SemanticChunker
from scripts.openai_client import get_embedding_client
from scripts.pgvector_writer import PGVectorWriter


class UnifiedIngest:
    def __init__(self):
        self.config = get_config()
        self.chunker = SemanticChunker(self.config)
        self.writer = PGVectorWriter(self.config)
        self.embedding_client = None

    def _get_embedding_client(self):
        if self.embedding_client is None:
            self.embedding_client = get_embedding_client()
        return self.embedding_client

    def _compute_file_hash(self, file_path: Path) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    async def ingest_file(self, file_path: Path, doc_id: str = None, doc_type: str = None, tenant_id: str = "") -> int:
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        doc_id = doc_id or file_path.name
        doc_type = doc_type or ("structured" if "structured" in str(file_path) else "document")
        file_hash = self._compute_file_hash(file_path)

        extracted_chunks = ExtractorRegistry.extract(file_path)

        for chunk in extracted_chunks:
            chunk.doc_id = doc_id
            chunk.doc_type = doc_type
            chunk.metadata["file_hash"] = file_hash

        semantic_chunks = self.chunker.chunk(extracted_chunks)

        for chunk in semantic_chunks:
            chunk["doc_id"] = doc_id
            chunk["doc_type"] = doc_type
            chunk["source_path"] = str(file_path)
            chunk["file_hash"] = file_hash
            chunk["tenant_id"] = tenant_id

        texts = [c["text"] for c in semantic_chunks]

        embed_client = self._get_embedding_client()
        embeddings = await embed_client.embed_passages(texts)

        self.writer.delete_document(doc_id, tenant_id=tenant_id)

        count = self.writer.upsert_chunks(semantic_chunks, embeddings)
        return count

    async def ingest_directory(self, directory: Path, recursive: bool = True, tenant_id: str = "") -> Dict[str, int]:
        directory = Path(directory)
        if not directory.exists():
            raise FileNotFoundError(f"Directory not found: {directory}")

        results = {}
        pattern = "**/*" if recursive else "*"

        for file_path in directory.glob(pattern):
            if file_path.is_file() and file_path.suffix.lower() in [".json", ".pdf", ".md", ".txt"]:
                try:
                    count = await self.ingest_file(file_path, tenant_id=tenant_id)
                    results[str(file_path)] = count
                    print(f"  Ingested {file_path.name}: {count} chunks")
                except Exception as e:
                    print(f"  Error ingesting {file_path.name}: {e}")
                    results[str(file_path)] = 0

        return results

    async def full_reindex(self, tenant_id: str = "") -> Dict[str, int]:
        print("Starting full reindex...")
        results = {}

        structured_path = Path(__file__).parent.parent / "knowledge" / "structured"
        if structured_path.exists():
            print(f"\nIngesting structured files from {structured_path}...")
            results.update(await self.ingest_directory(structured_path, recursive=False, tenant_id=tenant_id))

        incoming_path = Path(__file__).parent.parent / "knowledge" / "documents" / "incoming"
        if incoming_path.exists():
            print(f"\nIngesting documents from {incoming_path}...")
            results.update(await self.ingest_directory(incoming_path, recursive=False, tenant_id=tenant_id))

        total_chunks = sum(results.values())
        print(f"\nFull reindex complete: {total_chunks} total chunks from {len(results)} files")
        return results


async def main():
    ingest = UnifiedIngest()
    await ingest.full_reindex()


if __name__ == "__main__":
    asyncio.run(main())