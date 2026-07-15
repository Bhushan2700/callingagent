import os
from typing import List, Dict


class CrossEncoderReranker:
    """Re-rank search results using cross-encoder for higher precision."""
    
    def __init__(self):
        self.model = None
        self._loaded = False
    
    def _load_model(self):
        """Lazy load the cross-encoder model."""
        if self._loaded:
            return
        
        try:
            from sentence_transformers import CrossEncoder
            model_name = os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-12-v2")
            self.model = CrossEncoder(model_name)
            self._loaded = True
        except ImportError:
            print("WARNING: sentence-transformers not installed. Reranking disabled.")
            self._loaded = True  # Mark as loaded to avoid retry
    
    def rerank(self, query: str, chunks: List[Dict], top_k: int = 5) -> List[Dict]:
        """Re-rank chunks using cross-encoder.
        
        Args:
            query: The search query
            chunks: List of chunk dicts with 'text' field
            top_k: Number of top results to return
            
        Returns:
            Re-ranked list of chunks with 'rerank_score' added
        """
        if not chunks:
            return []
        
        self._load_model()
        
        # If model not available, return original order
        if self.model is None:
            for i, chunk in enumerate(chunks):
                chunk["rerank_score"] = 1.0 - (i * 0.1)  # Simulate decreasing scores
            return chunks[:top_k]
        
        # Create query-document pairs
        pairs = [(query, chunk["text"]) for chunk in chunks]
        
        # Get scores
        scores = self.model.predict(pairs)
        
        # Add scores to chunks
        for chunk, score in zip(chunks, scores):
            chunk["rerank_score"] = float(score)
        
        # Sort by score descending
        reranked = sorted(chunks, key=lambda x: x["rerank_score"], reverse=True)
        
        return reranked[:top_k]


# Singleton instance
_reranker = None


def get_reranker() -> CrossEncoderReranker:
    """Get or create reranker singleton."""
    global _reranker
    if _reranker is None:
        _reranker = CrossEncoderReranker()
    return _reranker
