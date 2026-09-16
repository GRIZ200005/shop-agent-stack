import json
import pytest
from shop_agent_stack import runtime, tools
from test_runtime import setup_runtime


@pytest.mark.asyncio
@pytest.mark.parametrize("sufficient", [True, False])
async def test_parallel_policy_searches_are_assessed_together(tmp_path, monkeypatch, sufficient):
    store, rid = setup_runtime(tmp_path, monkeypatch)
    judged = []
    hits = [{"citation_id": f"P{i}V1C1", "text": text, "title": "政策", "policy_id": i,
             "version": 1, "clause_no": 1, "content_hash": str(i)}
            for i, text in [(1, "说明破损位置与发现时间"), (2, "由客服审核")]]
    async def model(provider, messages, definitions, **kwargs):
        if messages[0]["content"].startswith("SHOP_AGENT_STACK_POLICY_ASSESSMENT_V1"):
            payload = json.loads(messages[-1]["content"])
            judged.append(payload)
            assert {h["citation_id"] for h in payload["evidence"]} == {"P1V1C1", "P2V1C1"}
            return {"content": json.dumps({"decision": "sufficient" if sufficient else "retry",
                "evidence_ids": ["P1V1C1", "P2V1C1"] if sufficient else [], "query": "补查"})}, {}
        if messages[-1]["role"] == "tool":
            return {"role": "assistant", "content": "请说明破损位置与时间 [P1V1C1]，由客服审核 [P2V1C1]。"}, {}
        return {"role": "assistant", "tool_calls": [
            {"id": str(i), "function": {"name": "search_policies", "arguments": json.dumps({"query": str(i)})}}
            for i in (1, 2)]}, {}
    async def invoke(session, name, args):
        if name == "search_policies":
            return {"evidence": [hits[int(args["query"])-1]], "retrieval": {"method": "BM25"}}
        assert name == "get_policy_source"
        return {"policy": {"clauses": [{"clause_no": 1, "content_hash": str(args["policy_id"])}]}}
    monkeypatch.setattr(runtime.providers, "complete", model)
    monkeypatch.setattr(tools, "call", invoke)
    await runtime.execute(store, store.run(rid, 1), 1, "synthetic-grant")
    run = store.run(rid, 1)
    assert run["status"] == "COMPLETED" and len(judged) == 1
    checks = [e["data"] for e in run["events"] if e["kind"] == "policy_check"]
    assert len(checks) == 1
    assert any(e["kind"] == "citations" for e in run["events"]) == sufficient
    if not sufficient:
        assert checks[0]["reason"] == "retry_budget_exhausted"


@pytest.mark.asyncio
async def test_truncated_assessment_blocks_answer_and_business_tools(tmp_path, monkeypatch):
    store, rid = setup_runtime(tmp_path, monkeypatch)
    async def model(provider, messages, definitions, **kwargs):
        if messages[0]["content"].startswith("SHOP_AGENT_STACK_POLICY_ASSESSMENT_V1"):
            assert kwargs["max_output_tokens"] == 4096
            return {"content": None}, {"total_tokens": 4096, "finish_reason": "length"}
        return {"role": "assistant", "tool_calls": [
            {"id": "p", "function": {"name": "search_policies", "arguments": '{"query":"政策"}'}},
            {"id": "b", "function": {"name": "preview_after_sale", "arguments": "{}"}}]}, {}
    async def invoke(session, name, args):
        assert name == "search_policies"
        return {"evidence": [], "retrieval": {"method": "BM25"}}
    monkeypatch.setattr(runtime.providers, "complete", model)
    monkeypatch.setattr(tools, "call", invoke)
    await runtime.execute(store, store.run(rid, 1), 1, "synthetic-grant")
    run = store.run(rid, 1)
    assert run["status"] == "FAILED"
    assert not any(e["kind"] in {"preview", "citations"} for e in run["events"])
    assert any("未完整结束" in str(e) for e in run["events"])


@pytest.mark.asyncio
@pytest.mark.parametrize("decision", ["clarify", "insufficient", "malformed"])
async def test_policy_terminal_blocks_pending_business_tools(tmp_path, monkeypatch, decision):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    calls=[]
    async def model(provider,messages,definitions,**kwargs):
        if messages[0]["content"].startswith("SHOP_AGENT_STACK_POLICY_ASSESSMENT_V1"):
            text="not json" if decision=="malformed" else json.dumps({"decision":decision,"missing_fields":["usage"]})
            return {"role":"assistant","content":text},{"total_tokens":7}
        return {"role":"assistant","tool_calls":[
            {"id":"p","function":{"name":"search_policies","arguments":'{"query":"政策"}'}},
            {"id":"b","function":{"name":"preview_after_sale","arguments":"{}"}}]},{}
    async def invoke(session,name,args):
        calls.append(name)
        if name!="search_policies": pytest.fail("Business side-effect path reached after unanswered policy question")
        return {"evidence":[],"retrieval":{"method":"BM25"}}
    monkeypatch.setattr(runtime.providers,"complete",model)
    monkeypatch.setattr(tools,"call",invoke)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    run=store.run(rid,1)
    assert run["status"]=="COMPLETED" and calls==["search_policies"]
    assert not any(e["kind"] in {"preview","citations"} for e in run["events"])
    assert any(e["kind"]=="policy_check" for e in run["events"])
    assert any(e["kind"]=="usage" and e["data"].get("stage")=="policy_assessment" for e in run["events"])
