import pytest
from aster_agent import runtime, tools
from test_runtime import setup_runtime


@pytest.mark.asyncio
@pytest.mark.parametrize("valid", [True, False])
async def test_policy_answer_is_released_only_after_revalidation(tmp_path, monkeypatch, valid):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    hit={"citation_id":"P1V1C1","policy_id":1,"version":1,"clause_no":1,"content_hash":"hash","text":"模拟退款不转账","title":"测试"}
    count=0
    async def model(*args,on_delta,**kwargs):
        nonlocal count
        if args[1][0]["content"].startswith("ASTER_POLICY_ASSESSMENT_V1"):
            return {"role":"assistant","content":'{"decision":"sufficient","evidence_ids":["P1V1C1"]}'},{}
        count+=1
        if count==1:
            return {"role":"assistant","tool_calls":[{"id":"x","function":{"name":"search_policies","arguments":'{"query":"退款政策"}'}}]},{}
        await on_delta("模拟退款不转账 [P1V1C1]")
        assert not any(e["kind"] in {"assistant","assistant_delta","citations"} for e in store.run(rid,1)["events"])
        return {"role":"assistant","content":"模拟退款不转账 [P1V1C1]"},{}
    async def call(session,name,args):
        if name=="search_policies": return {"evidence":[hit],"retrieval":{"method":"BM25"}}
        assert name=="get_policy_source"
        if not valid: raise ValueError("政策已撤回")
        return {"policy":{"clauses":[{"clause_no":1,"content_hash":"hash"}]}}
    monkeypatch.setattr(runtime.providers,"complete",model)
    monkeypatch.setattr(tools,"call",call)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    run=store.run(rid,1)
    assert run["status"] == ("COMPLETED" if valid else "FAILED")
    assert any(e["kind"]=="citations" for e in run["events"]) == valid
    assert any(e["kind"]=="assistant" for e in run["events"]) == valid


@pytest.mark.asyncio
async def test_invented_citation_does_not_become_verified_source(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    async def model(*args,**kwargs): return {"role":"assistant","content":"允许退款 [P999V1C1]"},{}
    monkeypatch.setattr(runtime.providers,"complete",model)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    run=store.run(rid,1)
    assert run["status"]=="FAILED"
    assert not any(e["kind"]=="citations" for e in run["events"])
