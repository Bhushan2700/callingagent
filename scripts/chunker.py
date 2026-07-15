import re
import tiktoken
from typing import List
from scripts.config import get_config
from scripts.extractors import DocumentChunk


class HeadingAwareChunker:
    """Split text respecting headings, merge into token-sized chunks."""
    
    def __init__(self, config=None):
        if config is None:
            config = get_config()
        self.max_tokens = config.chunking["max_tokens"]
        self.overlap_tokens = config.chunking["overlap_tokens"]
        self.min_chunk_tokens = config.chunking["min_chunk_tokens"]
        try:
            self.enc = tiktoken.get_encoding("cl100k_base")
        except Exception:
            self.enc = None

    def count_tokens(self, text: str) -> int:
        if self.enc:
            return len(self.enc.encode(text))
        return len(text) // 4

    def chunk(self, doc_chunks: List[DocumentChunk]) -> List[dict]:
        all_chunks = []
        current_section = ""
        current_subsection = ""

        for doc_chunk in doc_chunks:
            # Track section hierarchy
            if doc_chunk.heading_level == 1:
                current_section = doc_chunk.section
                current_subsection = ""
            elif doc_chunk.heading_level == 2:
                current_subsection = doc_chunk.section
            elif doc_chunk.section and doc_chunk.section != current_section:
                current_section = doc_chunk.section

            section_path = current_section
            if current_subsection:
                section_path = f"{current_section} > {current_subsection}"

            # Split text into sentences
            sentences = self._split_sentences(doc_chunk.text)
            
            # Merge sentences into chunks
            raw_chunks = self._merge_sentences(sentences, section_path, doc_chunk.metadata)
            
            # Add overlap
            overlapped = self._add_overlap(raw_chunks)
            
            # Add parent context to each chunk
            for chunk in overlapped:
                chunk["metadata"]["section_path"] = section_path
                chunk["metadata"]["parent_section"] = current_section
                chunk["metadata"]["subsection"] = current_subsection
            
            all_chunks.extend(overlapped)

        # Add chunk indices
        for i, chunk in enumerate(all_chunks):
            chunk["chunk_index"] = i
            chunk["total_chunks"] = len(all_chunks)

        return all_chunks

    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        # Handle common abbreviations
        text = re.sub(r'(?<!\w)(Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Jr|Sr|etc|vs|approx)\.\s', r'\1<DOT> ', text)
        text = re.sub(r'(\d+)\.\s', r'\1<DOT> ', text)  # Numbers like "3.5"
        
        # Split on sentence boundaries
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        # Restore dots
        sentences = [s.replace('<DOT>', '.').strip() for s in sentences if s.strip()]
        return sentences

    def _merge_sentences(self, sentences: List[str], section: str, metadata: dict) -> List[dict]:
        """Merge sentences into chunks respecting max_tokens."""
        chunks = []
        current_sentences = []
        current_tokens = 0

        for sentence in sentences:
            sentence_tokens = self.count_tokens(sentence)
            
            # Single sentence too long - emit alone
            if sentence_tokens > self.max_tokens:
                if current_sentences:
                    chunks.append(self._make_chunk(
                        " ".join(current_sentences), section, metadata
                    ))
                    current_sentences = []
                    current_tokens = 0
                chunks.append(self._make_chunk(sentence, section, metadata))
                continue
            
            # Would exceed limit - flush current buffer
            if current_tokens + sentence_tokens > self.max_tokens:
                if current_sentences:
                    chunks.append(self._make_chunk(
                        " ".join(current_sentences), section, metadata
                    ))
                current_sentences = [sentence]
                current_tokens = sentence_tokens
            else:
                current_sentences.append(sentence)
                current_tokens += sentence_tokens

        # Flush remaining
        if current_sentences:
            chunk = self._make_chunk(" ".join(current_sentences), section, metadata)
            if self.count_tokens(chunk["text"]) >= self.min_chunk_tokens:
                chunks.append(chunk)
            elif chunks:
                # Merge tiny tail into previous
                chunks[-1]["text"] += " " + chunk["text"]

        return chunks

    def _add_overlap(self, chunks: List[dict]) -> List[dict]:
        """Add overlap by prefixing each chunk with tail of previous."""
        if len(chunks) <= 1:
            return chunks

        overlapped = [chunks[0]]
        
        for i in range(1, len(chunks)):
            prev_sentences = self._split_sentences(chunks[i - 1]["text"])
            
            # Take last N sentences for overlap
            overlap_text = []
            overlap_tokens = 0
            for s in reversed(prev_sentences):
                tokens = self.count_tokens(s)
                if overlap_tokens + tokens > self.overlap_tokens:
                    break
                overlap_text.insert(0, s)
                overlap_tokens += tokens

            if overlap_text:
                new_text = " ".join(overlap_text) + " " + chunks[i]["text"]
                overlapped.append({**chunks[i], "text": new_text})
            else:
                overlapped.append(chunks[i])

        return overlapped

    def _make_chunk(self, text: str, section: str, metadata: dict) -> dict:
        chunk_metadata = metadata.copy() if metadata else {}
        chunk_metadata["section"] = section
        chunk_metadata["keywords"] = self._extract_keywords(text)
        chunk_metadata["summary"] = self._get_summary(text)
        
        return {
            "text": text,
            "section": section,
            "metadata": chunk_metadata
        }

    def _extract_keywords(self, text: str) -> str:
        """Extract top keywords using frequency."""
        stopwords = {
            "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
            "have", "has", "had", "do", "does", "did", "will", "would", "could",
            "should", "may", "might", "shall", "can", "to", "of", "in", "for",
            "on", "with", "at", "by", "from", "as", "into", "through", "during",
            "before", "after", "above", "below", "between", "and", "but", "or",
            "nor", "not", "so", "yet", "both", "either", "neither", "each",
            "every", "all", "any", "few", "more", "most", "other", "some", "such",
            "no", "only", "own", "same", "than", "too", "very", "just", "that",
            "this", "these", "those", "it", "its", "i", "me", "my", "we", "our",
            "you", "your", "he", "him", "his", "she", "her", "they", "them", "their"
        }
        
        words = re.findall(r'\b[a-z]{3,}\b', text.lower())
        word_freq = {}
        for word in words:
            if word not in stopwords:
                word_freq[word] = word_freq.get(word, 0) + 1
        
        top_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]
        return ",".join([w[0] for w in top_words])

    def _get_summary(self, text: str) -> str:
        """Get first sentence as summary."""
        sentences = self._split_sentences(text)
        if sentences:
            return sentences[0][:200]
        return text[:200]


# Keep backward compatibility
SemanticChunker = HeadingAwareChunker
