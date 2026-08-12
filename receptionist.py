import os
import re
import time
import json
import psycopg2
from pathlib import Path
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "so", "for", "to", "of", "in",
    "on", "at", "by", "with", "from", "as", "is", "are", "was", "were", "be", "been",
    "being", "do", "does", "did", "have", "has", "had", "will", "would", "can", "could",
    "should", "shall", "may", "might", "must", "i", "you", "he", "she", "it", "we",
    "they", "me", "him", "her", "us", "them", "my", "your", "our", "their", "this",
    "that", "these", "those", "what", "which", "who", "whom", "whose", "how", "why",
    "when", "where", "about", "please", "tell", "know", "want", "like", "need", "get",
    "can", "going", "just", "not", "am", "no", "yes", "ok", "okay", "hi", "hello",
}


def _extract_keywords(query: str, limit: int = 6) -> list:
    words = re.findall(r"[A-Za-z0-9]+", query.lower())
    seen = []
    for w in words:
        if w not in STOPWORDS and len(w) > 2 and w not in seen:
            seen.append(w)
        if len(seen) >= limit:
            break
    return seen


def _detect_intent(query: str) -> str:
    q = query.lower()
    if any(k in q for k in ["book", "appointment", "schedule", "meeting", "consultation", "slot", "calendar"]):
        return "appointment_booking"
    if any(k in q for k in ["refund", "return", "money back", "cancel my order"]):
        return "refund_policy"
    if any(k in q for k in ["price", "pricing", "cost", "charge", "fee", "rate", "plan", "subscription", "billing", "invoice"]):
        return "pricing"
    if any(k in q for k in ["ticket", "support", "help with", "problem", "broken", "issue", "complaint", "escalate", "human", "agent"]):
        return "support"
    if any(k in q for k in ["hour", "open", "close", "weekend", "when"]):
        return "business_hours"
    if any(k in q for k in ["ship", "delivery", "shipping", "international"]):
        return "shipping"
    return "general"


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
        self.confidence_threshold = self.config.retrieval.get("confidence_threshold", 0.1)
        self.vector_weight = 0.65
        self.keyword_weight = 0.35
        conf = self.config.retrieval.get("confidence", {})
        self.high_confidence = conf.get("high", 0.6)
        self.medium_confidence = conf.get("medium", 0.35)
        self.rerank_provider = self.config.retrieval.get("rerank", {}).get("provider", "none")
        self.rerank_top_k = self.config.retrieval.get("rerank", {}).get("top_k", self.top_k_final)

        self.base_prompt = """You are the AI Receptionist for Loggix, a software development firm.

Always use search_knowledge to look up information. Give short, natural answers.

APPOINTMENT BOOKING - CRITICAL:
When someone wants to book an appointment, you MUST collect ALL 6 pieces of information before calling book_appointment:

1. NAME (full name)
2. PHONE NUMBER
3. EMAIL ADDRESS
4. TOPIC (what they want to discuss)
5. DATE (preferred date)
6. TIME (preferred time)

HOW TO COLLECT:
- If user gives multiple details at once, accept them all and only ask for what's missing
- If user says "I want to book an appointment, my name is John, email is john@gmail.com", then ask for phone, topic, date, and time
- Always confirm before booking: "Let me confirm: Name is [name], phone is [phone], email is [email], topic is [topic], on [date] at [time]. Is that correct?"
- ONLY call book_appointment after user says "yes" or confirms

EMAIL HANDLING - IMPORTANT:
When user spells their email, they will say things like:
- "john at gmail dot com" = john@gmail.com
- "sarah at the rate yahoo dot com" = sarah@yahoo.com
- "mike at outlook dot com" = mike@outlook.com
- "admin at loggix dot com" = admin@loggix.com
Convert "at" or "at the rate" to @ and "dot" to . automatically.

PHONE HANDLING:
- "eight seven seven five six nine four nine eight three eight" = 87756949838
- "oh one two three four five six seven" = 01234567
- Convert spoken numbers to digits automatically

DATE HANDLING:
- "tomorrow" = tomorrow's date in YYYY-MM-DD
- "next Monday" = the coming Monday in YYYY-MM-DD
- "July 20" = 2025-07-20 in YYYY-MM-DD format
- Always convert to YYYY-MM-DD format

TIME HANDLING:
- "3pm" or "3 pm" = 15:00
- "10 in the morning" = 10:00
- "half past two" = 14:30
- Always convert to HH:MM format (24-hour)

RULES:
- Short, warm, professional answers
- If any detail is unclear or missing, ask for clarification
- Never guess missing information
- English only unless caller speaks Dutch"""

    async def search(self, query: str, tenant_id: str = "") -> dict:
        start_total = time.time()

        if not tenant_id:
            raise ValueError("tenant_id is required for search")

        query_embedding = await self.embedding_client.embed_query(query)

        where = {"tenant_id": tenant_id}
        vector_results = self._writer.query(query_embedding, n_results=self.top_k_initial, where=where)

        keyword_terms = _extract_keywords(query)
        keyword_results = self._writer.keyword_search(keyword_terms, n_results=self.top_k_initial, tenant_id=tenant_id) if keyword_terms else []

        merged = {}
        if vector_results and vector_results.get("documents") and vector_results["documents"][0]:
            for doc, meta in zip(vector_results["documents"][0], vector_results["metadatas"][0]):
                distance = meta.get("distance", 0)
                similarity = 1 - distance if distance else 0
                cid = meta.get("chunk_id", "")
                merged[cid] = {
                    "text": doc,
                    "chunk_id": cid,
                    "doc_id": meta.get("doc_id", ""),
                    "section": meta.get("section", ""),
                    "subsection": meta.get("subsection", ""),
                    "section_path": meta.get("section_path", "") or meta.get("section", ""),
                    "page": meta.get("page", ""),
                    "similarity": similarity,
                    "keyword_score": 0.0,
                }

        for r in keyword_results:
            cid = r["chunk_id"]
            if cid in merged:
                merged[cid]["keyword_score"] = r["keyword_score"]
            else:
                merged[cid] = {
                    "text": r["text"],
                    "chunk_id": cid,
                    "doc_id": r["doc_id"],
                    "section": r["section"],
                    "subsection": r["subsection"],
                    "section_path": r["section"] or r["subsection"],
                    "page": r["page"],
                    "similarity": 0.0,
                    "keyword_score": r["keyword_score"],
                }

        if not merged:
            return {
                "chunks": [], "query_latency_ms": (time.time() - start_total) * 1000,
                "confidence": 0, "confidence_level": "low", "intent": _detect_intent(query), "sources": [],
            }

        for cid, chunk in merged.items():
            chunk["fused_score"] = (
                self.vector_weight * chunk["similarity"]
                + self.keyword_weight * chunk["keyword_score"]
            )

        ranked = sorted(merged.values(), key=lambda x: x["fused_score"], reverse=True)

        if self.rerank_provider and self.rerank_provider != "none":
            ranked = await self._rerank(query, ranked)

        final_chunks = ranked[:self.top_k_final]

        confidence = self._compute_confidence(final_chunks)
        confidence_level = self._classify_confidence(confidence)

        sources = self._build_sources(final_chunks, confidence)

        query_latency = (time.time() - start_total) * 1000

        self._log_query(query, final_chunks, query_latency)

        return {
            "chunks": final_chunks,
            "query_latency_ms": query_latency,
            "confidence": confidence,
            "confidence_level": confidence_level,
            "intent": _detect_intent(query),
            "sources": sources,
        }

    async def _rerank(self, query: str, chunks: list) -> list:
        """Rerank chunks using the configured provider. 'none' = keep fused score order."""
        provider = (self.rerank_provider or "none").lower()
        if provider == "cohere":
            try:
                import httpx
                key = os.getenv("COHERE_API_KEY", "")
                if not key:
                    return chunks
                docs = [c["text"][:500] for c in chunks]
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://api.cohere.com/v2/rerank",
                        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                        json={"model": "rerank-multilingual-v3.0", "query": query, "documents": docs, "top_n": self.rerank_top_k},
                        timeout=30,
                    )
                    resp.raise_for_status()
                    results = resp.json().get("results", [])
                    reranked = []
                    for r in results:
                        idx = r.get("index", 0)
                        if 0 <= idx < len(chunks):
                            chunks[idx]["rerank_score"] = r.get("relevance_score", 0)
                            reranked.append(chunks[idx])
                    if reranked:
                        return reranked
            except Exception as e:
                print(f"Rerank error ({provider}): {e}")
                return chunks
        return chunks

    def _compute_confidence(self, chunks: list) -> float:
        if not chunks:
            return 0
        scores = [c.get("fused_score", c.get("similarity", 0)) for c in chunks[:3]]
        return max(0.0, min(1.0, sum(scores) / len(scores)))

    def _classify_confidence(self, confidence: float) -> str:
        if confidence >= self.high_confidence:
            return "high"
        if confidence >= self.medium_confidence:
            return "medium"
        return "low"

    def _build_sources(self, chunks: list, confidence: float) -> list:
        sources = []
        for c in chunks:
            sources.append({
                "document_id": c.get("doc_id", ""),
                "document_name": c.get("doc_id", ""),
                "chunk_id": c.get("chunk_id", ""),
                "page": c.get("page", ""),
                "section": c.get("section_path", "") or c.get("section", ""),
                "retrieval_score": round(c.get("similarity", 0), 4),
                "rerank_score": round(c.get("rerank_score", 0), 4) if c.get("rerank_score") is not None else None,
                "final_relevance": round(c.get("fused_score", c.get("similarity", 0)), 4),
            })
        return sources

    def _log_query(self, query: str, final_chunks: list, query_latency: float, tenant_id: str = ""):
        try:
            log_dir = Path(__file__).parent.parent / "logs"
            log_dir.mkdir(exist_ok=True)

            log_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "tenant_id": tenant_id,
                "query": query,
                "latency_ms": query_latency,
                "retrieval": {
                    "final_results": len(final_chunks),
                    "top_score": final_chunks[0].get("fused_score", 0) if final_chunks else 0
                },
                "final_chunks": [
                    {
                        "doc_id": c.get("doc_id", ""),
                        "section": c.get("section", ""),
                        "score": c.get("fused_score", 0),
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

    def _tenant_settings(self, tenant_id: str) -> dict | None:
        """Load per-tenant assistant settings from the tenants table."""
        url = os.getenv("DATABASE_URL", "")
        if not url or not tenant_id:
            return None
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        try:
            with psycopg2.connect(url) as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT company_name, industry, description, languages, timezone, business_hours, tools_enabled "
                    "FROM tenants WHERE id = %s",
                    (tenant_id,),
                )
                row = cur.fetchone()
            if not row or not row[0]:
                return None
            return {
                "company_name": row[0],
                "industry": row[1] or "",
                "description": row[2] or "",
                "languages": row[3] or ["English"],
                "timezone": row[4] or "UTC",
                "business_hours": row[5] or "",
                "tools_enabled": row[6] or [],
            }
        except Exception:
            return None

    async def get_response(self, user_input: str, history: list = None, tenant_id: str = "") -> str:
        if history is None:
            history = []

        if not tenant_id:
            return "I'm sorry, I couldn't identify your account. Please try again."

        search_result = await self.search(user_input, tenant_id=tenant_id)
        chunks = search_result["chunks"]
        confidence = search_result["confidence"]

        from scripts.vapi_client import build_system_prompt
        settings = self._tenant_settings(tenant_id)

        if not chunks or confidence < self.confidence_threshold:
            if settings and "book_appointment" in settings.get("tools_enabled", []):
                answer = "I don't have that specific detail, but I can schedule a consultation appointment for you. Would you like that?"
            else:
                answer = "I don't have enough information in the company's knowledge base to answer that accurately."
            return self._contract(answer, confidence, False, search_result, resolved_by="escalate")

        system_prompt = build_system_prompt(settings) if settings else self.base_prompt

        context_parts = []
        for i, chunk in enumerate(chunks):
            section = chunk.get("section_path") or chunk.get("section", "General")
            context_parts.append(f"[Source {i+1}: {chunk.get('doc_id', 'Unknown')} - {section}]\n{chunk['text']}")

        context_str = "\n\n".join(context_parts)
        system_prompt = f"{system_prompt}\n\n--- CONTEXT ---\n{context_str}\n--- END CONTEXT ---"

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": user_input})

        response = self.llm_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.1,
        )

        answer = response.choices[0].message.content
        return self._contract(answer, confidence, True, search_result, resolved_by="ai")

    def _contract(self, answer: str, confidence: float, resolved: bool, search_result: dict, resolved_by: str = "ai") -> dict:
        return {
            "answer": answer,
            "confidence": round(confidence, 2),
            "confidence_level": search_result.get("confidence_level", "low"),
            "resolved": resolved,
            "intent": search_result.get("intent", "general"),
            "sources": search_result.get("sources", []),
            "retrieved_chunk_count": len(search_result.get("chunks", [])),
            "resolved_by": resolved_by,
        }
