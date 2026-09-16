import json
import pytest
from shop_agent_stack import context, runtime, tools
from shop_agent_stack.catalog import with_snapshot
from test_runtime import setup_runtime


@pytest.mark.asyncio
async def test_old_reference_repaired_without_releasing_unverified_draft(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    prior=store.run(rid,1);store.state(rid,"RUNNING")
    store.finish_task(rid,1,context.observe_products(context.empty(),[{"id":10002,"name":"杯"}]),"COMPLETED","")
    rid,_=store.create_run(prior["session_id"],1,"budget","改成20元","fixture")
    round_no=0
    async def model(provider,messages,definitions,on_delta,**kwargs):
        nonlocal round_no
        round_no+=1
        if round_no==1:
            return {"role":"assistant","tool_calls":[{"id":"s","function":{"name":"search_products","arguments":'{"max_price":20}'}}]},{}
        if round_no==2:
            await on_delta("旧商品29元 [G10002]")
            return {"role":"assistant","content":"旧商品29元 [G10002]"},{}
        assert "上一条草稿商品引用未通过校验" in str(messages)
        return {"role":"assistant","content":"本次查询没有找到20元以内的玻璃杯。"},{}
    async def call(*args):return {"products":[]}
    monkeypatch.setattr(runtime.providers,"complete",model);monkeypatch.setattr(tools,"call",call)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    run=store.run(rid,1)
    assert run["status"]=="COMPLETED" and round_no==3
    assert not any(e["kind"]=="assistant_delta" for e in run["events"])
    assert "29元" not in str(run["events"])


@pytest.mark.asyncio
@pytest.mark.parametrize("withdrawn",[False,True])
async def test_mixed_answer_revalidates_both_sources_before_promotion(tmp_path,monkeypatch,withdrawn):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    product=with_snapshot({"id":1,"name":"合成壶","evidence_id":"G1","price":20})
    hit={"citation_id":"P1V1C1","policy_id":1,"version":1,"clause_no":1,"content_hash":"h","title":"预览规则","text":"预览不退款"}
    step=0
    async def model(provider,messages,definitions,**kwargs):
        nonlocal step
        if messages[0]["content"].startswith("SHOP_AGENT_STACK_POLICY_ASSESSMENT_V1"):
            return {"role":"assistant","content":'{"decision":"sufficient","evidence_ids":["P1V1C1"]}'},{}
        step+=1
        if step==1:
            return {"role":"assistant","tool_calls":[{"id":n,"function":{"name":n,"arguments":"{}"}} for n in ["search_products","search_policies"]]},{}
        return {"role":"assistant","content":"壶标价20元 [G1]；预览不退款 [P1V1C1]"},{}
    async def call(session,name,args):
        if name=="search_products":return {"products":[product]}
        if name=="search_policies":return {"evidence":[hit],"retrieval":{"method":"BM25"}}
        if name=="get_product":return {"product":product}
        if withdrawn:raise ValueError("政策已撤回")
        return {"policy":{"clauses":[{"clause_no":1,"content_hash":"h"}]}}
    monkeypatch.setattr(runtime.providers,"complete",model);monkeypatch.setattr(tools,"call",call)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    run=store.run(rid,1)
    assert run["status"]==("FAILED" if withdrawn else "COMPLETED")
    assert any(e["kind"]=="product_sources" for e in run["events"])== (not withdrawn)
    assert bool(store.task_context(run["session_id"],1)["recent_products"]) == (not withdrawn)
