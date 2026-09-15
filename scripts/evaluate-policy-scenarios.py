"""Observed synthetic development scenarios: retrieval scores, not answer accuracy."""
import csv
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "services/agent"))
from aster_agent.knowledge import LexicalIndex, load_drafts

corpus = root / "knowledge/authoring/policies.tsv"
gold = root / "evaluation/policy-scenarios-v2.tsv"
index = LexicalIndex(load_drafts(corpus), at=date(2026, 9, 15), draft_preview=True)
cases = []
with gold.open(encoding="utf-8", newline="") as stream:
    for row in csv.DictReader(stream, delimiter="\t"):
        expected = set(filter(None, row["relevant_clauses"].split(",")))
        if not expected <= {d.metadata["clause_id"] for d in index.documents}:
            raise ValueError("Unknown gold clause")
        hits = index.search(row["query"], k=5)
        ranked = [h["clause_id"] for h in hits]
        found = expected.intersection(ranked)
        scored = row["kind"] in {"answerable", "multi"}
        if scored and not expected:
            raise ValueError("Answerable case requires evidence")
        cases.append({**row, "retrieved": ranked,
            "recall_at_5": len(found) / len(expected) if scored else None,
            "reciprocal_rank_at_5": next((1 / (i + 1) for i, c in enumerate(ranked) if c in expected), 0) if scored else None,
            "all_annotated_evidence_at_5": expected <= set(ranked) if scored else None,
            "answer_behavior_result": "NOT_RUN"})

def aggregate(rows):
    return {"count": len(rows),
            "macro_recall_at_5": sum(r["recall_at_5"] for r in rows) / len(rows),
            "mrr_at_5": sum(r["reciprocal_rank_at_5"] for r in rows) / len(rows),
            "all_annotated_evidence_rate_at_5": sum(r["all_annotated_evidence_at_5"] for r in rows) / len(rows)}

scored = [r for r in cases if r["recall_at_5"] is not None]
report = {"split": "observed-synthetic-development", "mode": "offline-draft-preview",
    "retriever": "BM25-character-bigram", "customer_documents": len(index.documents) // 3,
    "customer_clauses": len(index.documents), "staff_in_index": False,
    "corpus_sha256": hashlib.sha256(corpus.read_bytes()).hexdigest(),
    "gold_sha256": hashlib.sha256(gold.read_bytes()).hexdigest(),
    "retrieval": aggregate(scored),
    "by_kind": {kind: aggregate([r for r in scored if r["kind"] == kind]) for kind in ("answerable", "multi")},
    "unscored_behavior_cases": len(cases) - len(scored),
    "limitations": ["No model call or answer scoring", "No production publication or live permission test",
        "Gold evidence may have unannotated equivalents; human review needed",
        "Corpus and queries co-authored with AI; not independent holdout",
        "Related retrieval candidates on unanswerable questions are not automatically failures"],
    "cases": cases}
output = root / "evaluation/reports/policy-scenarios-v2-bm25.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k != "cases"}, ensure_ascii=False))
