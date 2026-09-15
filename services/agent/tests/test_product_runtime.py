import json
import pytest
from aster_agent import runtime, tools
from aster_agent.catalog import with_snapshot
from test_runtime import setup_runtime


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["valid", "changed", "invented", "missing"])
async def test_product_answers_require_current_cited_evidence(tmp_path, monkeypatch, outcome):
    store, rid = setup_runtime(tmp_path, monkeypatch)
    product = with_snapshot({"id":10001,"evidence_id":"G10001","name":"合成杯","price":29,"skus":[{"available_stock":7}]})
    turn = 0
    async def model(*args, **kwargs):
        nonlocal turn
        turn += 1
        if turn == 1:
            return {"role":"assistant","tool_calls":[{"id":"p","function":{"name":"search_products","arguments":json.dumps({"query":"杯"})}}]}, {}
        text = {"valid":"合成杯标价29元 [G10001]", "changed":"合成杯标价29元 [G10001]", "invented":"推荐杯 [G99999]", "missing":"推荐合成杯"}[outcome]
        await kwargs["on_delta"](text)
        return {"role":"assistant","content":text}, {}
    async def call(session, name, args):
        if name == "search_products": return {"products":[product]}
        assert name == "get_product" and args == {"product_id":10001}
        return {"product":with_snapshot({**product,"price":30}) if outcome == "changed" else product}
    monkeypatch.setattr(runtime.providers, "complete", model)
    monkeypatch.setattr(tools, "call", call)
    await runtime.execute(store, store.run(rid,1), 1, "synthetic-grant")
    run = store.run(rid,1)
    assert run["status"] == ("COMPLETED" if outcome == "valid" else "FAILED")
    assert not any(e["kind"] == "assistant_delta" for e in run["events"])
    assert any(e["kind"] == "product_sources" for e in run["events"]) == (outcome == "valid")
    assert any(e["kind"] == "assistant" for e in run["events"]) == (outcome == "valid")


def test_snapshot_is_order_independent_and_detects_stock_change():
    a = {"id":1,"evidence_id":"G1","skus":[{"available_stock":7}]}
    assert with_snapshot(a)["snapshot"] == with_snapshot(dict(reversed(list(a.items()))))["snapshot"]
    assert with_snapshot(a)["snapshot"] != with_snapshot({**a,"skus":[{"available_stock":6}]})["snapshot"]
    with pytest.raises(ValueError): with_snapshot({**a,"evidence_id":"G2"})


@pytest.mark.asyncio
async def test_final_round_reserves_an_answer_after_tool_context_overhead(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    rounds=0
    async def model(provider,messages,definitions,**kwargs):
        nonlocal rounds
        rounds+=1
        if rounds<4:
            return {"role":"assistant","tool_calls":[{"id":str(rounds),"function":{"name":"list_my_orders","arguments":"{}"}}]}, {"total_tokens":3000}
        assert definitions==[]
        return {"role":"assistant","content":"未查询到订单。"},{"total_tokens":3000}
    async def query(*args): return {"orders":[]}
    monkeypatch.setattr(runtime.providers,"complete",model)
    monkeypatch.setattr(tools,"call",query)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    assert store.run(rid,1)["status"]=="COMPLETED" and rounds==4


@pytest.mark.asyncio
async def test_mcp_wrapped_controlled_error_is_not_lost(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    async def model(*args,**kwargs):
        raise ExceptionGroup("transport wrapper",[ExceptionGroup("nested",[ValueError("已达到本次执行预算")])])
    monkeypatch.setattr(runtime.providers,"complete",model)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    errors=[e["data"]["message"] for e in store.run(rid,1)["events"] if e["kind"]=="error"]
    assert errors==["已达到本次执行预算"]
