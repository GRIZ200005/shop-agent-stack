"""Generate an honest development-only retrieval report; no production writes."""
import csv
import hashlib
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "services/agent"))
from shop_agent_stack.knowledge import LexicalIndex, load_drafts

source = root / "knowledge/authoring/policies.tsv"
gold = root / "evaluation/retrieval-dev.tsv"
documents = load_drafts(source)
# An explicit offline preview of drafts. Normal retrieval excludes all drafts.
index = LexicalIndex(documents, at=date(2026, 9, 15), draft_preview=True)
results = []
with gold.open(encoding="utf-8", newline="") as file:
    for case in csv.DictReader(file, delimiter="\t"):
        expected = set(case["relevant_clauses"].split(","))
        if not expected <= {d.metadata["clause_id"] for d in documents}:
            raise ValueError("Gold clause is missing")
        hits = index.search(case["query"])
        returned = {hit["clause_id"] for hit in hits}
        results.append({"id": case["id"], "retrieved": [h["clause_id"] for h in hits],
                        "expected": sorted(expected), "recall_at_5": len(expected & returned)/len(expected)})
manifest = {"schema_version": 1, "source": "shop_agent_stack-original-synthetic", "review_status": "DRAFT_NOT_PUBLISHED",
            "documents": len({d.metadata["doc_id"] for d in documents}), "clauses": len(documents),
            "categories": dict(Counter(d.metadata["category"] for d in documents)),
            "corpus_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "clause_hashes": {d.metadata["clause_id"]: d.metadata["content_hash"] for d in documents}}
(root / "knowledge/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
report = {"mode": "offline-draft-preview", "retriever": "BM25-character-bigram", "split": "observed-development",
          "not_ai_task_success": True, "corpus_sha256": manifest["corpus_sha256"],
          "gold_sha256": hashlib.sha256(gold.read_bytes()).hexdigest(), "sample_count": len(results),
          "macro_recall_at_5": sum(x["recall_at_5"] for x in results)/len(results), "cases": results}
out = root / ".local/knowledge-baseline.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print(json.dumps({k:v for k,v in report.items() if k != "cases"}, ensure_ascii=False))
print(f"Draft documents: {manifest['documents']}; clauses: {manifest['clauses']}; production-visible: {len(LexicalIndex(documents, at=date(2026,9,15)).documents)}")
