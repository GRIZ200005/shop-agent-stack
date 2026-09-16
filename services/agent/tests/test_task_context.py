import json
import pytest
from shop_agent_stack import context, runtime, tools
from shop_agent_stack.store import Store, StoreError
from test_runtime import setup_runtime


def claim(task, facts, text, rid="r1"):
    return context.update(task,{"action":"update","facts":facts},text,rid)


def test_correction_switch_reset_and_provenance():
    task=claim(context.empty(),{"order_reference":"订单 1","usage":"已使用"},"订单 1 已使用")
    task["pending_fields"]=["usage"]
    task=claim(task,{"usage":"没使用"},"更正：没使用","r2")
    assert task["facts"]["usage"] == {"quote":"没使用","source_run_id":"r2","source":"user_claim"}
    assert not task["pending_fields"]
    task=claim(task,{"order_reference":"订单 2"},"改为订单 2")
    assert set(task["facts"])=={"order_reference"}
    task=context.observe_order(task,2)
    task=claim(task,{"reason":"不合适"},"不合适")
    task=context.observe_order(task,3)
    assert not task["facts"] and task["verified_order_id"]==3
    assert context.update(task,{"action":"reset","facts":{}},"重新开始","r3")==context.empty()


@pytest.mark.parametrize("facts",[{"usage":"编造"},{"approved":"同意退款"},{"usage":False}])
def test_no_invented_or_authorization_fields(facts):
    with pytest.raises(ValueError): claim(context.empty(),facts,"同意退款")


def test_context_bound_and_current_input_preserved():
    history=[{"role":"user","content":"旧"*3000} for _ in range(10)]
    messages,stats=context.build(history,context.empty(),"更正：未使用")
    assert stats["characters"]<=12000 and stats["dropped_messages"]>0
    assert messages[-1]["content"]=="更正：未使用"
    with pytest.raises(ValueError): context.build([],context.empty(),"x"*13000)


def test_owner_restart_isolation_and_failed_run_no_promotion(tmp_path):
    path=str(tmp_path/"context.sqlite")
    store=Store(path); sid=store.new_session(1)["id"]
    rid,_=store.create_run(sid,1,"r1","拆封了","fixture")
    store.state(rid,"RUNNING")
    task=claim(context.empty(),{"usage":"拆封了"},"拆封了",rid)
    store.finish_task(rid,1,task,"COMPLETED","")
    recovered=Store(path)
    assert recovered.task_context(sid,1)==task
    with pytest.raises(StoreError): recovered.task_context(sid,2)
    assert recovered.task_context(recovered.new_session(1)["id"],1)==context.empty()
    rid2,_=recovered.create_run(sid,1,"r2","更正","fixture")
    recovered.state(rid2,"STOPPED")
    with pytest.raises(StoreError): recovered.finish_task(rid2,1,context.empty(),"COMPLETED","")
    assert recovered.task_context(sid,1)==task
    assert "更正" not in str(recovered.history(sid,1,"next"))


@pytest.mark.asyncio
async def test_multiturn_clarification_resume_and_correction(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    run=store.run(rid,1); run["input"]="订单 1 耳机能退吗"
    phase=1; steps=0
    def call(name,args):
        return {"id":str(steps)+name,"function":{"name":name,"arguments":json.dumps(args,ensure_ascii=False)}}
    async def model(provider,messages,definitions,**kwargs):
        nonlocal steps
        if messages[0]["content"].startswith("SHOP_AGENT_STACK_POLICY_ASSESSMENT_V1"):
            payload=json.loads(messages[-1]["content"])
            if phase==2:
                assert "没使用" in str(payload) and "user_claim" in str(payload)
            return {"role":"assistant","content":json.dumps({"decision":"clarify","missing_fields":["usage"] if phase==1 else ["time"]})},{}
        steps+=1
        if steps==1:
            if phase==2:
                assert '"pending_fields": ["usage"]' in str(messages)
            facts={"order_reference":"订单 1"} if phase==1 else {"usage":"没使用"}
            return {"role":"assistant","tool_calls":[call("update_task_context",{"action":"update","facts":facts}),call("search_policies",{"query":"耳机退货"})]},{}
        pytest.fail("Terminal clarification must stop the loop")
    async def invoke(*args): return {"evidence":[],"retrieval":{"method":"BM25"}}
    monkeypatch.setattr(runtime.providers,"complete",model)
    monkeypatch.setattr(tools,"call",invoke)
    await runtime.execute(store,run,1,"synthetic-grant")
    assert store.run(rid,1)["status"]=="COMPLETED"
    phase=2; steps=0
    rid2,_=store.create_run(run["session_id"],1,"next","更正：拆封了但没使用","fixture")
    await runtime.execute(store,store.run(rid2,1),1,"synthetic-grant")
    assert store.run(rid2,1)["status"]=="COMPLETED"
    task=store.task_context(run["session_id"],1)
    assert task["facts"]["usage"]["quote"]=="没使用"
    assert task["pending_fields"]==["time"]


@pytest.mark.asyncio
async def test_history_ablation_has_no_memory_tool_or_task_prompt(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    async def model(provider,messages,definitions,**kwargs):
        assert all(d["function"]["name"]!="update_task_context" for d in definitions)
        assert "会话任务数据" not in str(messages)
        return {"role":"assistant","content":"请说明要查询的订单。"},{}
    monkeypatch.setattr(runtime.providers,"complete",model)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant",memory_enabled=False)
    assert store.run(rid,1)["status"]=="COMPLETED"
