import os
from typing import List
from openai import AsyncOpenAI


class OpenAIEmbeddingClient:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = "text-embedding-3-small"

    async def embed_passages(self, texts: List[str]) -> List[List[float]]:
        """Embed multiple text passages."""
        all_embeddings = []
        batch_size = 2048
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = await self.client.embeddings.create(
                model=self.model,
                input=batch
            )
            all_embeddings.extend([item.embedding for item in response.data])
        
        return all_embeddings

    async def embed_query(self, text: str) -> List[float]:
        """Embed a single query."""
        response = await self.client.embeddings.create(
            model=self.model,
            input=text
        )
        return response.data[0].embedding


_embedding_client = None


def get_embedding_client() -> OpenAIEmbeddingClient:
    global _embedding_client
    if _embedding_client is None:
        _embedding_client = OpenAIEmbeddingClient()
    return _embedding_client
