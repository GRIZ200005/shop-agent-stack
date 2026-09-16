"""Pure ranking operations shared by experiments. No model or infrastructure dependency."""
import math


def rrf(rankings, constant=60):
    if constant <= 0:
        raise ValueError("RRF constant must be positive")
    scores = {}
    for ranking in rankings:
        seen = set()
        for rank, identity in enumerate(ranking, 1):
            if identity in seen:
                continue
            seen.add(identity)
            scores[identity] = scores.get(identity, 0) + 1 / (constant + rank)
    return sorted(scores, key=lambda identity: (-scores[identity], identity))


def metrics(ranked, relevant, k=5):
    if not relevant:
        raise ValueError("Unanswerable cases require behavior evaluation, not retrieval gold")
    if len(ranked) != len(set(ranked)):
        raise ValueError("Duplicate retrieved identity")
    selected = ranked[:k]
    hits = set(selected) & relevant
    dcg = sum(1 / math.log2(i + 2) for i, identity in enumerate(selected) if identity in relevant)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(k, len(relevant))))
    return {"recall_at_5": len(hits) / len(relevant),
            "mrr_at_5": next((1 / (i + 1) for i, identity in enumerate(selected) if identity in relevant), 0),
            "ndcg_at_5": dcg / ideal,
            "all_evidence_at_5": float(relevant <= set(selected))}
