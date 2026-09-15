import json
import pytest
from aster_agent import runtime, tools
from test_runtime import setup_runtime


@pytest.mark.asyncio
@pytest.mark.parametrize("decision", ["clarify", "insufficient", "malformed"])
async def test_policy_terminal_blocks_pending_business_tools(tmp_path, monkeypatch, decision):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    calls=[]
    async def model(provider,messages,definitions,**kwargs):
        if messages[0]["content"].startswith("ASTER_POLICY_ASSESSMENT_V1"):
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
