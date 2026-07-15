import os
import sys
import json
import uuid
import hashlib
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional
import redis

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.config import get_config
from scripts.extractors import ExtractorRegistry
from scripts.chunker import HeadingAwareChunker as SemanticChunker
from scripts.openai_client import get_embedding_client
from scripts.chromadb_writer import ChromaDBWriter


class RedisQueue:
    def __init__(self, redis_url: str = None, queue_name: str = "document_ingestion"):
        if redis_url is None:
            config = get_config()
            redis_url = config.redis["url"]
        self.redis = redis.from_url(redis_url, decode_responses=True)
        self.queue_name = queue_name
        self.dlq_name = f"{queue_name}_dlq"
        self.processed_set = f"{queue_name}_processed"

    def enqueue(self, job: dict) -> str:
        job_id = job.get("job_id") or str(uuid.uuid4())
        job["job_id"] = job_id
        job["created_at"] = datetime.utcnow().isoformat()
        self.redis.rpush(self.queue_name, json.dumps(job))
        return job_id

    def dequeue(self, timeout: int = 5) -> Optional[dict]:
        result = self.redis.blpop(self.queue_name, timeout=timeout)
        if result:
            _, data = result
            return json.loads(data)
        return None

    def requeue(self, job: dict, delay: int = 0):
        if delay > 0:
            asyncio.sleep(delay)
        job["retries"] = job.get("retries", 0) + 1
        self.redis.rpush(self.queue_name, json.dumps(job))

    def move_to_dlq(self, job: dict, error: str = ""):
        job["error"] = error
        job["failed_at"] = datetime.utcnow().isoformat()
        self.redis.rpush(self.dlq_name, json.dumps(job))

    def mark_processed(self, file_hash: str):
        self.redis.sadd(self.processed_set, file_hash)

    def is_processed(self, file_hash: str) -> bool:
        return self.redis.sismember(self.processed_set, file_hash)


class IngestionWorker:
    def __init__(self):
        self.config = get_config()
        self.queue = RedisQueue()
        self.chunker = SemanticChunker(self.config)
        self.writer = ChromaDBWriter(self.config)
        self.embedding_client = None
        self.running = True

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

    async def process_ingest(self, job: dict) -> int:
        file_path = Path(job["file_path"])
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        doc_id = job.get("doc_id", file_path.name)
        doc_type = job.get("doc_type", "document")
        file_hash = job.get("file_hash") or self._compute_file_hash(file_path)

        self.queue.mark_processed(file_hash)

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

        texts = [c["text"] for c in semantic_chunks]

        embed_client = self._get_embedding_client()
        embeddings = await embed_client.embed_passages(texts)

        self.writer.delete_document(doc_id)

        count = self.writer.upsert_chunks(semantic_chunks, embeddings)
        return count

    async def process_delete(self, job: dict) -> int:
        doc_id = job.get("doc_id")
        if not doc_id:
            raise ValueError("doc_id required for delete action")
        return self.writer.delete_document(doc_id)

    async def process_reindex(self, job: dict) -> int:
        doc_id = job.get("doc_id")
        archive_dir = Path(__file__).parent.parent / "knowledge" / "documents" / "archive"

        found = None
        if archive_dir.exists():
            for f in archive_dir.glob("*"):
                if f.is_file() and f.stem == doc_id:
                    found = f
                    break

        if not found:
            structured_dir = Path(__file__).parent.parent / "knowledge" / "structured"
            for f in structured_dir.glob("*"):
                if f.is_file() and f.stem == doc_id:
                    found = f
                    break

        if not found:
            raise FileNotFoundError(f"Could not find file for doc_id: {doc_id}")

        return await self.process_ingest({
            "file_path": str(found),
            "doc_id": doc_id,
            "doc_type": "structured" if "structured" in str(found) else "document"
        })

    async def run(self):
        print(f"Ingestion worker started. Listening on queue: {self.config.redis['queue_name']}")

        while self.running:
            try:
                job = self.queue.dequeue(timeout=5)
                if not job:
                    continue

                action = job.get("action", "ingest")
                print(f"Processing job {job.get('job_id')}: {action} - {job.get('file_path', job.get('doc_id', ''))}")

                count = 0
                if action == "ingest":
                    count = await self.process_ingest(job)
                elif action == "delete":
                    count = await self.process_delete(job)
                elif action == "reindex":
                    count = await self.process_reindex(job)
                else:
                    print(f"Unknown action: {action}")

                print(f"  Completed: {count} chunks")

            except FileNotFoundError as e:
                print(f"  File not found, moving to DLQ: {e}")
                self.queue.move_to_dlq(job, str(e))

            except Exception as e:
                print(f"  Error: {e}")
                retries = job.get("retries", 0)
                if retries < 3:
                    delay = 2 ** retries
                    print(f"  Retrying in {delay}s (attempt {retries + 1}/3)")
                    self.queue.requeue(job, delay=delay)
                else:
                    print(f"  Max retries exceeded, moving to DLQ")
                    self.queue.move_to_dlq(job, str(e))

    def stop(self):
        self.running = False


async def main():
    worker = IngestionWorker()
    try:
        await worker.run()
    except KeyboardInterrupt:
        print("\nShutting down worker...")
        worker.stop()


if __name__ == "__main__":
    asyncio.run(main())