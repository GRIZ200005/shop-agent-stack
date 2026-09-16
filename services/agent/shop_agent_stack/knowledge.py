"""Offline lexical baseline. No model calls and no implicit publication of drafts."""
import csv
import hashlib
import math
import re
from collections import Counter
from datetime import date
from pathlib import Path
from langchain_core.documents import Document


def load_drafts(path: Path) -> list[Document]:
    documents = []
    seen = set()
    with path.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source, delimiter="\t"):
            if row["id"] in seen:
                raise ValueError("Duplicate document ID")
            seen.add(row["id"])
            for number in range(1, 4):
                text = row[f"clause_{number}"].strip()
                if not text:
                    raise ValueError("Empty clause")
                documents.append(Document(page_content=text, metadata={
                    "doc_id": row["id"], "clause_id": f"{row['id']}-C{number}",
                    "title": row["title"], "category": row["category"], "version": 1,
                    "status": "DRAFT", "visibility": "CUSTOMER", "effective_from": None,
                    "effective_to": None, "source": "shop_agent_stack-original-synthetic",
                    "content_hash": hashlib.sha256(text.encode()).hexdigest(),
                }))
    return documents


def tokens(text: str) -> list[str]:
    # Chinese character bigrams make this baseline reproducible without a model
    # download. This is lexical retrieval, NOT a substitute for dense embeddings.
    words = re.findall(r"[a-z0-9]+", text.lower())
    for segment in re.findall(r"[\u4e00-\u9fff]+", text):
        words.extend(segment[i:i+2] for i in range(len(segment)-1))
        if len(segment) == 1:
            words.append(segment)
    return words


def eligible(doc: Document, at: date, preview: bool) -> bool:
    meta = doc.metadata
    if meta.get("visibility") != "CUSTOMER":
        return False
    if preview and meta.get("status") == "DRAFT":
        return True
    if meta.get("status") != "PUBLISHED" or not meta.get("effective_from"):
        return False
    start = date.fromisoformat(meta["effective_from"])
    end = date.fromisoformat(meta["effective_to"]) if meta.get("effective_to") else None
    return start <= at and (end is None or at < end)


class LexicalIndex:
    def __init__(self, documents: list[Document], *, at: date, draft_preview=False):
        self.documents = [doc for doc in documents if eligible(doc, at, draft_preview)]
        identities = [(d.metadata["clause_id"], d.metadata["version"]) for d in self.documents]
        if len(set(identities)) != len(identities):
            raise ValueError("Duplicate clause version")
        active_versions = {}
        for doc in self.documents:
            versions = active_versions.setdefault(doc.metadata["doc_id"], set())
            versions.add(doc.metadata["version"])
            if len(versions) > 1:
                raise ValueError("Overlapping policy versions")
        self.terms = [Counter(tokens(d.metadata["title"] + " " + d.page_content)) for d in self.documents]
        self.lengths = [sum(t.values()) for t in self.terms]
        self.average = sum(self.lengths) / max(1, len(self.lengths))
        self.df = Counter(term for record in self.terms for term in record)

    def search(self, query: str, k=5) -> list[dict]:
        if not 1 <= k <= 20 or len(query) > 2000:
            raise ValueError("Invalid retrieval budget")
        query_terms = set(tokens(query))
        ranked = []
        for doc, terms, length in zip(self.documents, self.terms, self.lengths):
            score = 0.0
            for term in query_terms:
                tf = terms[term]
                if not tf:
                    continue
                idf = math.log(1 + (len(self.documents)-self.df[term]+0.5)/(self.df[term]+0.5))
                score += idf * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * length / self.average))
            if score > 0:
                ranked.append({"score": score, "text": doc.page_content, **doc.metadata})
        return sorted(ranked, key=lambda x: (-x["score"], x["clause_id"]))[:k]
