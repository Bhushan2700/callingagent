import os
import time
import json
from pathlib import Path
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


class LoggixReceptionist:
    def __init__(self):
        self.llm_client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
        )

        from scripts.pgvector_writer import PGVectorWriter
        self._writer = PGVectorWriter()
        self.writer = self._writer

        from scripts.openai_client import get_embedding_client
        self.embedding_client = get_embedding_client()

        from scripts.config import get_config
        self.config = get_config()

        self.top_k_initial = self.config.retrieval["top_k_initial"]
        self.top_k_final = self.config.retrieval.get("top_k_final", 5)
        self.confidence_threshold = self.config.retrieval.get("confidence_threshold", 0.3)

        self.base_prompt = """You are the AI Receptionist for Loggix, a software development firm.

Always use search_knowledge to look up information. Give short, natural answers.

APPOINTMENT BOOKING:
When someone wants to schedule a call or book an appointment, collect these details naturally through conversation:
- Name
- Phone number
- Email address
- What they want to discuss (e.g., AI project, web development, FileMaker)
- Preferred date
- Preferred time

Once you have ALL the details, confirm with the user: "Let me confirm: Name is [name], phone is [phone], email is [email], you want to discuss [topic] on [date] at [time]. Is that correct?"

Only after user confirms, call book_appointment with ALL fields:
- name
- phone
- email
- enquiry_topic (what they want to discuss)
- appointment_date (in YYYY-MM-DD format, e.g. 2024-07-15)
- appointment_time (in HH:MM format, e.g. 14:00 for 2pm)

If user provides multiple details at once, use them all. Only ask for what's missing.

SPELLING & VOICE RECOGNITION:
- Auto-correct common misspellings from voice recognition
- "Jeroen" not "Jaron", "Loggix" not "Logic's"
- "at the rate" or "at" = @, "dot" = .
- "three" = 3, "eight" = 8, etc.
- If something sounds wrong, use the most likely correct version

RULES:
- Collect info naturally, don't ask one question at a time if user gives multiple details
- Short, warm, professional answers
- For dates: "tomorrow" = today + 1, "next Monday" = coming Monday
- For times: "3pm" = 15:00, "10am" = 10:00
- English only unless caller speaks Dutch"""

    async def search(self, query: str) -> dict:
        start_total = time.time()

        # 1. Embed query
        query_embedding = await self.embedding_client.embed_query(query)

        # 2. Vector search (top-10)
        results = self._writer.query(query_embedding, n_results=10)

        if not results or not results.get("documents") or not results["documents"][0]:
            return {"chunks": [], "query_latency_ms": (time.time() - start_total) * 1000, "confidence": 0}

        # 3. Build chunks with similarity scores
        chunks = []
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            distance = meta.get("distance", 0)
            similarity = 1 - distance if distance else 0
            chunks.append({
                "text": doc,
                "doc_id": meta.get("doc_id", ""),
                "section": meta.get("section", ""),
                "subsection": meta.get("subsection", ""),
                "section_path": meta.get("section_path", ""),
                "chunk_id": meta.get("chunk_id", ""),
                "similarity": similarity
            })

        # 4. Deduplicate by doc_id (keep best chunk per document)
        seen_docs = {}
        for chunk in chunks:
            doc_id = chunk["doc_id"]
            if doc_id not in seen_docs or chunk["similarity"] > seen_docs[doc_id]["similarity"]:
                seen_docs[doc_id] = chunk
        
        # 5. Take top results
        deduped = sorted(seen_docs.values(), key=lambda x: x["similarity"], reverse=True)
        final_chunks = deduped[:self.top_k_final]

        # 6. Compute confidence
        confidence = self._compute_confidence(final_chunks)

        query_latency = (time.time() - start_total) * 1000

        self._log_query(query, final_chunks, query_latency)

        return {
            "chunks": final_chunks,
            "query_latency_ms": query_latency,
            "confidence": confidence
        }

    def _compute_confidence(self, chunks: list) -> float:
        scores = [c.get("similarity", 0) for c in chunks[:3]]
        return sum(scores) / len(scores) if scores else 0

    def _log_query(self, query: str, final_chunks: list, query_latency: float):
        try:
            log_dir = Path(__file__).parent.parent / "logs"
            log_dir.mkdir(exist_ok=True)

            log_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "query": query,
                "latency_ms": query_latency,
                "retrieval": {
                    "final_results": len(final_chunks),
                    "top_score": final_chunks[0].get("similarity", 0) if final_chunks else 0
                },
                "final_chunks": [
                    {
                        "doc_id": c.get("doc_id", ""),
                        "section": c.get("section", ""),
                        "score": c.get("similarity", 0),
                        "text_preview": c.get("text", "")[:100]
                    }
                    for c in final_chunks[:3]
                ]
            }

            log_file = log_dir / f"rag_queries_{datetime.utcnow().strftime('%Y%m%d')}.jsonl"
            with open(log_file, "a") as f:
                f.write(json.dumps(log_entry) + "\n")

        except Exception as e:
            print(f"Logging error: {e}")

    async def get_response(self, user_input: str, history: list = None) -> str:
        if history is None:
            history = []

        search_result = await self.search(user_input)
        chunks = search_result["chunks"]

        if not chunks or search_result["confidence"] < self.confidence_threshold:
            return "I don't have that specific detail, but I can schedule a free 30-minute consultation for you. Would you like that?"

        context_parts = []
        for i, chunk in enumerate(chunks):
            section = chunk.get("section_path") or chunk.get("section", "General")
            context_parts.append(f"[Source {i+1}: {chunk.get('doc_id', 'Unknown')} - {section}]\n{chunk['text']}")

        context_str = "\n\n".join(context_parts)
        system_prompt = f"{self.base_prompt}\n\n--- CONTEXT ---\n{context_str}\n--- END CONTEXT ---"

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": user_input})

        response = self.llm_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.1,
        )

        return response.choices[0].message.content
