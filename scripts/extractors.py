import json
import re
from pathlib import Path
from typing import List, Any
from dataclasses import dataclass


@dataclass
class DocumentChunk:
    text: str
    doc_id: str
    doc_type: str
    source_path: str
    section: str = ""
    subsection: str = ""
    heading_level: int = 0
    page: int = None
    metadata: dict = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class BaseExtractor:
    def extract(self, file_path: Path) -> List[DocumentChunk]:
        raise NotImplementedError

    def _clean(self, text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()


class JSONExtractor(BaseExtractor):
    def extract(self, file_path: Path) -> List[DocumentChunk]:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        doc_id = file_path.name
        chunks = []

        if file_path.stem == "company":
            chunks.extend(self._extract_company(data, doc_id, str(file_path)))
        elif file_path.stem == "services":
            chunks.extend(self._extract_services(data, doc_id, str(file_path)))
        elif file_path.stem == "faqs":
            chunks.extend(self._extract_faqs(data, doc_id, str(file_path)))
        elif file_path.stem == "policies":
            chunks.extend(self._extract_policies(data, doc_id, str(file_path)))
        elif file_path.stem == "case_studies":
            chunks.extend(self._extract_case_studies(data, doc_id, str(file_path)))
        elif file_path.stem == "differentiation":
            chunks.extend(self._extract_differentiation(data, doc_id, str(file_path)))
        elif file_path.stem == "team_members":
            chunks.extend(self._extract_team_members(data, doc_id, str(file_path)))

        return chunks

    def _extract_company(self, data: dict, doc_id: str, source: str) -> List[DocumentChunk]:
        chunks = []
        chunks.append(DocumentChunk(
            text=f"Loggix: {data.get('tagline', '')}.",
            doc_id=doc_id, doc_type="structured", source_path=source,
            section="Company Overview", metadata={"category": "company", "tags": "identity,overview"}
        ))
        chunks.append(DocumentChunk(
            text=f"Founder: {data.get('founder', '')}",
            doc_id=doc_id, doc_type="structured", source_path=source,
            section="Leadership", metadata={"category": "company", "tags": "leadership"}
        ))
        for loc in data.get("locations", []):
            chunks.append(DocumentChunk(
                text=f"Location - {loc.get('name', '')}: {loc.get('city', '')}, {loc.get('country', '')}",
                doc_id=doc_id, doc_type="structured", source_path=source,
                section="Locations", metadata={"category": "company", "tags": "location"}
            ))
        c = data.get("contact", {})
        chunks.append(DocumentChunk(
            text=f"Contact Loggix at phone {c.get('phone', '')}, email {c.get('email', '')}, or visit {c.get('website', '')}",
            doc_id=doc_id, doc_type="structured", source_path=source,
            section="Contact", metadata={"category": "company", "tags": "contact"}
        ))
        for d in data.get("key_disclaimers", []):
            chunks.append(DocumentChunk(
                text=d, doc_id=doc_id, doc_type="structured", source_path=source,
                section="Disclaimers", metadata={"category": "company", "tags": "disclaimer"}
            ))
        if data.get("free_offer"):
            chunks.append(DocumentChunk(
                text=data["free_offer"], doc_id=doc_id, doc_type="structured", source_path=source,
                section="Free Offer", metadata={"category": "company", "tags": "free_offer,consultation"}
            ))
        return chunks

    def _extract_services(self, data: List[dict], doc_id: str, source: str) -> List[DocumentChunk]:
        chunks = []
        for svc in data:
            for sub in svc.get("sub_services", []):
                text = f"{svc['name']} - {sub['name']}. {sub.get('description', '')}"
                if sub.get("use_cases"):
                    text += f" Use cases: {', '.join(sub['use_cases'])}."
                if sub.get("tech_stack"):
                    text += f" Tech: {', '.join(sub['tech_stack'])}."
                if sub.get("pricing_model"):
                    text += f" Pricing: {sub['pricing_model']}."
                if sub.get("typical_timeline"):
                    text += f" Timeline: {sub['typical_timeline']}."
                chunks.append(DocumentChunk(
                    text=self._clean(text),
                    doc_id=doc_id, doc_type="structured", source_path=source,
                    section=f"{svc['name']}", subsection=sub.get('name', ''),
                    metadata={"category": "service", "tags": svc["name"].lower().replace(" ", "_")}
                ))
        return chunks

    def _extract_faqs(self, data: dict, doc_id: str, source: str) -> List[DocumentChunk]:
        chunks = []
        for faq in data.get("faqs", []):
            text = f"FAQ: {faq['question']} Answer: {faq['answer']}"
            chunks.append(DocumentChunk(
                text=self._clean(text),
                doc_id=doc_id, doc_type="structured", source_path=source,
                section="FAQs", metadata={"category": "faq", "tags": ",".join(faq.get("tags", []))}
            ))
        return chunks

    def _extract_policies(self, data: dict, doc_id: str, source: str) -> List[DocumentChunk]:
        chunks = []
        for p in data.get("policies", []):
            text = f"{p['title']}: {p['content']}"
            chunks.append(DocumentChunk(
                text=self._clean(text),
                doc_id=doc_id, doc_type="structured", source_path=source,
                section="Policies", metadata={"category": "policy", "tags": p.get("category", "")}
            ))
        return chunks

    def _extract_case_studies(self, data: List[dict], doc_id: str, source: str) -> List[DocumentChunk]:
        chunks = []
        for cs in data:
            text = f"Case Study ({cs.get('industry', '')}): {cs.get('title', '')}. Challenge: {cs.get('challenge', '')} Solution: {cs.get('solution', '')} Results: {cs.get('results', '')}"
            chunks.append(DocumentChunk(
                text=self._clean(text),
                doc_id=doc_id, doc_type="structured", source_path=source,
                section="Case Studies", metadata={"category": "case_study", "tags": cs.get('industry', '')}
            ))
        return chunks

    def _extract_differentiation(self, data: dict, doc_id: str, source: str) -> List[DocumentChunk]:
        chunks = []
        for d in data.get("differentiators", []):
            text = f"{d.get('title', '')}: {d.get('description', '')}"
            chunks.append(DocumentChunk(
                text=self._clean(text),
                doc_id=doc_id, doc_type="structured", source_path=source,
                section="Differentiation", metadata={"category": "differentiation", "tags": "differentiator"}
            ))
        return chunks

    def _extract_team_members(self, data: List[dict], doc_id: str, source: str) -> List[DocumentChunk]:
        chunks = []
        for m in data:
            text = f"Team: {m.get('name', '')} - {m.get('position', '')}, {m.get('location', '')}. Email: {m.get('email', '')}. Specializes in: {', '.join(m.get('specializations', []))}"
            chunks.append(DocumentChunk(
                text=self._clean(text),
                doc_id=doc_id, doc_type="structured", source_path=source,
                section="Team Members", metadata={"category": "team_member", "tags": m.get('position', '').lower().replace(" ", "_")}
            ))
        return chunks


class PDFExtractor(BaseExtractor):
    def extract(self, file_path: Path) -> List[DocumentChunk]:
        import fitz
        chunks = []
        doc = fitz.open(str(file_path))
        doc_id = file_path.name

        for page_num, page in enumerate(doc):
            text = page.get_text()
            if not text.strip():
                continue
            sections = self._split_by_headers(text)
            for section_text in sections:
                if len(section_text.strip()) < 20:
                    continue
                chunks.append(DocumentChunk(
                    text=self._clean(section_text),
                    doc_id=doc_id, doc_type="document", source_path=str(file_path),
                    page=page_num + 1, section="Document",
                    metadata={"category": "document", "tags": "pdf"}
                ))
        return chunks

    def _split_by_headers(self, text: str) -> List[str]:
        lines = text.split("\n")
        sections = []
        current = []
        for line in lines:
            if line.isupper() and len(line) < 100:
                if current:
                    sections.append("\n".join(current))
                    current = []
            current.append(line)
        if current:
            sections.append("\n".join(current))
        return sections


class MarkdownExtractor(BaseExtractor):
    def extract(self, file_path: Path) -> List[DocumentChunk]:
        import markdown_it
        chunks = []
        doc_id = file_path.name

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        md = markdown_it.MarkdownIt()
        tokens = md.parse(content)

        current_section = ""
        current_subsection = ""
        heading_level = 0
        current_text = []

        for i, token in enumerate(tokens):
            if token.type in ("heading_open", "atx_open"):
                level = int(token.tag[1]) if token.tag.startswith("h") else 1

                if current_text:
                    text = "\n".join(current_text)
                    if len(text.strip()) > 20:
                        chunks.append(DocumentChunk(
                            text=self._clean(text),
                            doc_id=doc_id, doc_type="document", source_path=str(file_path),
                            section=current_section, subsection=current_subsection,
                            heading_level=heading_level,
                            metadata={"category": "document", "tags": file_path.stem}
                        ))
                    current_text = []

                if level == 1:
                    current_section = tokens[i + 1].content if i + 1 < len(tokens) else ""
                    current_subsection = ""
                    heading_level = 1
                elif level == 2:
                    current_subsection = tokens[i + 1].content if i + 1 < len(tokens) else ""
                    heading_level = 2
                else:
                    heading_level = level

            elif token.type in ("paragraph_open", "inline"):
                if token.type == "paragraph_open":
                    continue
                text = token.content
                if text.strip():
                    current_text.append(text)

        if current_text:
            text = "\n".join(current_text)
            if len(text.strip()) > 20:
                chunks.append(DocumentChunk(
                    text=self._clean(text),
                    doc_id=doc_id, doc_type="document", source_path=str(file_path),
                    section=current_section, subsection=current_subsection,
                    heading_level=heading_level,
                    metadata={"category": "document", "tags": file_path.stem}
                ))

        return chunks


class TextExtractor(BaseExtractor):
    def extract(self, file_path: Path) -> List[DocumentChunk]:
        chunks = []
        doc_id = file_path.name

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        paragraphs = content.split("\n\n")
        for para in paragraphs:
            if len(para.strip()) < 30:
                continue
            chunks.append(DocumentChunk(
                text=self._clean(para),
                doc_id=doc_id, doc_type="document", source_path=str(file_path),
                section="Document", metadata={"category": "document", "tags": file_path.stem}
            ))

        return chunks


class ExtractorRegistry:
    EXTRACTORS = {
        ".json": JSONExtractor,
        ".pdf": PDFExtractor,
        ".md": MarkdownExtractor,
        ".txt": TextExtractor,
    }

    @classmethod
    def extract(cls, file_path: Path) -> List[DocumentChunk]:
        ext = file_path.suffix.lower()
        extractor_class = cls.EXTRACTORS.get(ext)
        if not extractor_class:
            raise ValueError(f"No extractor for extension: {ext}")
        return extractor_class().extract(file_path)