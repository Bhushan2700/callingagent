import os
import sys
import json
import time
import hashlib
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

sys.path.insert(0, str(Path(__file__).parent.parent))

from workers.ingestion_worker import RedisQueue
from scripts.config import get_config


class DocumentHandler(FileSystemEventHandler):
    def __init__(self, queue: RedisQueue, config, debounce_seconds: float = 2.0):
        self.queue = queue
        self.config = config
        self.debounce_seconds = debounce_seconds
        self.debounce_cache = {}

    def _should_process(self, path: str) -> bool:
        file_path = Path(path)
        if not file_path.is_file():
            return False

        ext = file_path.suffix.lower()
        if ext not in [".pdf", ".txt", ".md", ".json"]:
            return False

        for pattern in self.config.watcher.get("ignore_patterns", []):
            if pattern.lstrip("*") in file_path.name:
                return False

        return True

    def _compute_hash(self, file_path: Path) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _enqueue(self, path: str, action: str = "ingest"):
        if not self._should_process(path):
            return

        now = time.time()
        if path in self.debounce_cache:
            if now - self.debounce_cache[path] < self.debounce_seconds:
                return

        self.debounce_cache[path] = now

        file_path = Path(path)

        try:
            file_hash = self._compute_hash(file_path)
        except Exception as e:
            print(f"Error computing hash for {path}: {e}")
            return

        if self.queue.is_processed(file_hash) and action == "ingest":
            print(f"Skipping already processed file: {file_path.name}")
            return

        is_structured = "structured" in str(file_path)
        doc_type = "structured" if is_structured else "document"

        job = {
            "action": action,
            "file_path": str(file_path),
            "file_hash": file_hash,
            "doc_id": file_path.name,
            "doc_type": doc_type,
        }

        job_id = self.queue.enqueue(job)
        print(f"Enqueued job {job_id}: {action} - {file_path.name}")

        self._archive_file(file_path)

    def _archive_file(self, file_path: Path):
        try:
            incoming = Path(__file__).parent.parent / "knowledge" / "documents" / "incoming"
            if file_path.parent == incoming:
                archive_dir = Path(__file__).parent.parent / "knowledge" / "documents" / "archive"
                archive_dir.mkdir(parents=True, exist_ok=True)

                timestamp = time.strftime("%Y%m%d_%H%M%S")
                archived_name = f"{timestamp}_{file_path.name}"
                archived_path = archive_dir / archived_name

                import shutil
                shutil.copy2(file_path, archived_path)
                print(f"Archived: {file_path.name} -> {archived_name}")
        except Exception as e:
            print(f"Error archiving file: {e}")

    def on_created(self, event):
        if event.is_directory:
            return
        self._enqueue(event.src_path, "ingest")

    def on_modified(self, event):
        if event.is_directory:
            return
        self._enqueue(event.src_path, "ingest")


def main():
    config = get_config()
    queue = RedisQueue()

    paths_to_watch = []
    for path_str in config.watcher.get("paths", []):
        path = Path(path_str)
        if not path.is_absolute():
            path = Path(__file__).parent.parent / path_str
        path.mkdir(parents=True, exist_ok=True)
        paths_to_watch.append(str(path))
        print(f"Watching: {path}")

    observer = Observer()
    handler = DocumentHandler(queue, config, debounce_seconds=config.watcher.get("debounce_seconds", 2.0))

    for path in paths_to_watch:
        observer.schedule(handler, path, recursive=False)

    observer.start()
    print("\nFile watcher started. Press Ctrl+C to stop.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down watcher...")
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()