import sys
import argparse
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.chromadb_writer import ChromaDBWriter
from scripts.unified_ingest import UnifiedIngest
from workers.ingestion_worker import RedisQueue


def cmd_list(writer: ChromaDBWriter):
    docs = writer.list_documents()
    if not docs:
        print("No documents in the database.")
        return

    print(f"\n{'Doc ID':<35} {'Type':<12} {'Chunks':<8} {'Sections'}")
    print("-" * 100)
    for doc in docs:
        sections = ", ".join(doc.get("sections", [])[:3])
        if len(doc.get("sections", [])) > 3:
            sections += "..."
        print(f"{doc['doc_id']:<35} {doc.get('doc_type', ''):<12} {doc.get('chunk_count', 0):<8} {sections}")


def cmd_info(writer: ChromaDBWriter, doc_id: str):
    info = writer.get_document_info(doc_id)
    if not info:
        print(f"Document not found: {doc_id}")
        return

    print(f"\nDocument: {doc_id}")
    print(f"  Type: {info.get('doc_type', 'unknown')}")
    print(f"  Chunks: {info.get('chunk_count', 0)}")
    print(f"  Source: {info.get('source_path', 'unknown')}")
    print(f"  Sections: {', '.join(info.get('sections', []))}")
    print(f"  Tags: {', '.join(info.get('tags', []))}")


def cmd_delete(writer: ChromaDBWriter, queue: RedisQueue, doc_id: str):
    count = writer.delete_document(doc_id)
    print(f"Deleted {count} chunks for document: {doc_id}")


def cmd_update(ingest: UnifiedIngest, writer: ChromaDBWriter, file_path: str):
    try:
        count = asyncio.run(ingest.ingest_file(Path(file_path)))
        print(f"Updated {file_path}: {count} chunks")
    except Exception as e:
        print(f"Error updating {file_path}: {e}")


def cmd_reindex(ingest: UnifiedIngest, confirm: bool = False):
    if not confirm:
        resp = input("This will clear the database and reindex all files. Continue? (y/N): ")
        if resp.lower() != "y":
            print("Cancelled.")
            return

    print("Starting full reindex...\n")
    results = asyncio.run(ingest.full_reindex())
    print(f"\nReindexed {len(results)} files.")


def cmd_stats(writer: ChromaDBWriter):
    docs = writer.list_documents()
    total_chunks = sum(doc.get("chunk_count", 0) for doc in docs)

    by_type = {}
    for doc in docs:
        dtype = doc.get("doc_type", "unknown")
        by_type[dtype] = by_type.get(dtype, 0) + doc.get("chunk_count", 0)

    print(f"\nDatabase Statistics")
    print(f"  Total Documents: {len(docs)}")
    print(f"  Total Chunks: {total_chunks}")
    print(f"  By Type:")
    for dtype, count in by_type.items():
        print(f"    {dtype}: {count}")


def main():
    parser = argparse.ArgumentParser(description="Manage Loggix RAG documents")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    list_parser = subparsers.add_parser("list", help="List all documents")
    list_parser.add_argument("--json", action="store_true", help="Output as JSON")

    info_parser = subparsers.add_parser("info", help="Show document details")
    info_parser.add_argument("doc_id", help="Document ID")

    delete_parser = subparsers.add_parser("delete", help="Delete a document")
    delete_parser.add_argument("doc_id", help="Document ID to delete")

    update_parser = subparsers.add_parser("update", help="Update/re-ingest a document")
    update_parser.add_argument("file_path", help="Path to file")

    reindex_parser = subparsers.add_parser("reindex", help="Full reindex of all documents")
    reindex_parser.add_argument("--confirm", action="store_true", help="Skip confirmation")

    stats_parser = subparsers.add_parser("stats", help="Show database statistics")

    args = parser.parse_args()

    writer = ChromaDBWriter()
    queue = RedisQueue()
    ingest = UnifiedIngest()

    if args.command == "list":
        cmd_list(writer)
    elif args.command == "info":
        cmd_info(writer, args.doc_id)
    elif args.command == "delete":
        cmd_delete(writer, queue, args.doc_id)
    elif args.command == "update":
        cmd_update(ingest, writer, args.file_path)
    elif args.command == "reindex":
        cmd_reindex(ingest, args.confirm)
    elif args.command == "stats":
        cmd_stats(writer)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()