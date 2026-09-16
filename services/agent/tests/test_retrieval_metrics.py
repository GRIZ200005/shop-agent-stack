import pytest
from shop_agent_stack.retrieval_metrics import metrics, rrf


def test_rrf_rewards_agreement_and_ignores_duplicate_votes():
    assert rrf([["a", "b"], ["b", "c"]])[0] == "b"
    assert rrf([["a", "a"], ["b"]]) == ["a", "b"]
    assert rrf([[], []]) == []


def test_rank_metrics_distinguish_partial_and_complete_evidence():
    partial = metrics(["x", "a", "y"], {"a", "b"})
    assert partial["recall_at_5"] == 0.5
    assert partial["mrr_at_5"] == 0.5
    assert partial["all_evidence_at_5"] == 0
    assert 0 < partial["ndcg_at_5"] < 1
    assert metrics(["a", "b"], {"a", "b"})["ndcg_at_5"] == 1
    with pytest.raises(ValueError): metrics([], set())
    with pytest.raises(ValueError): metrics(["a", "a"], {"a"})
