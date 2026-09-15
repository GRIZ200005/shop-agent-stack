from aster_agent.shopping_eval import score,summarize


def test_terminal_clarification_does_not_pass_mixed_evidence_contract():
    run={"status":"COMPLETED","events":[{"kind":"assistant","data":{"text":"需要补充条件。"}}]}
    checks=score({"products":[1],"policy_titles":["规则"]},run,[])
    assert checks["completed"] and not checks["expected_product_evidence"] and not checks["expected_policy_evidence"]


def test_correction_requires_new_budget_filter_not_just_a_successful_answer():
    run={"status":"COMPLETED","events":[]}
    old=[{"name":"search_products","arguments":{"max_price":50}}]
    assert not score({"search_max_price":20},run,old)["updated_budget_filter"]
    assert score({"search_max_price":20},run,[{"name":"search_products","arguments":{"max_price":20}}])["updated_budget_filter"]


def test_incomplete_runs_and_unreviewed_answers_are_visible():
    rows=[{"checks":{"completed":False},"reported_tokens":0,"human_review":None}]
    result=summarize(rows,4)
    assert result["planned_turns"]==4 and result["recorded_turns"]==1
    assert result["all_contracts_passed"]==0 and result["answer_accuracy"] is None
