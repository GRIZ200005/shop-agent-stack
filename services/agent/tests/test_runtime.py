from contextlib import asynccontextmanager
from types import SimpleNamespace
import pytest
from aster_agent import runtime, tools
from aster_agent.store import Store


def setup_runtime(tmp_path,monkeypatch):
    store=Store(str(tmp_path/"runtime.sqlite")); sid=store.new_session(1)["id"]
    rid,_=store.create_run(sid,1,"request","hello","fixture")
    class Session:
        async def list_tools(self):
            return SimpleNamespace(tools=[SimpleNamespace(name=n,description=n,inputSchema={"type":"object"}) for n in tools.MODEL_TOOLS])
    @asynccontextmanager
    async def connect(execution):
        assert execution=="synthetic-grant"
        yield Session()
    monkeypatch.setattr(tools,"connect",connect)
    return store,rid


@pytest.mark.asyncio
async def test_model_cannot_call_submit_tool(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch)
    async def malicious(*args, **kwargs):
        return {"role":"assistant","tool_calls":[{"id":"x","function":{"name":"submit_after_sale","arguments":"{}"}}]},{}
    async def forbidden(*args): pytest.fail("Forbidden tool reached transport")
    monkeypatch.setattr(runtime.providers,"complete",malicious); monkeypatch.setattr(tools,"call",forbidden)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    run=store.run(rid,1)
    assert run["status"]=="FAILED"
    assert any("未授权" in str(e) for e in run["events"])


@pytest.mark.asyncio
async def test_preview_pauses_and_confirmation_secret_never_reaches_model(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch); calls=[]
    async def model(provider,messages,definitions, **kwargs):
        calls.append(messages)
        return {"role":"assistant","reasoning_content":"private-thought","tool_calls":[{"id":"x","function":{"name":"preview_after_sale","arguments":"{}"}}]},{}
    async def preview(*args): return {"preview":{"id":"op","confirmationToken":"synthetic-confirmation"}}
    monkeypatch.setattr(runtime.providers,"complete",model); monkeypatch.setattr(tools,"call",preview)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    run=store.run(rid,1)
    assert run["status"]=="WAITING_CONFIRMATION" and len(calls)==1
    assert "synthetic-confirmation" not in str(calls)
    assert "private-thought" not in str(run)
    assert "synthetic-confirmation" not in str(store.history(run["session_id"],1,"another"))


@pytest.mark.asyncio
async def test_tool_loop_is_bounded(tmp_path,monkeypatch):
    store,rid=setup_runtime(tmp_path,monkeypatch); count=0
    async def loop(*args, **kwargs):
        return {"role":"assistant","tool_calls":[{"id":"x","function":{"name":"list_my_orders","arguments":"{}"}}]},{}
    async def query(*args):
        nonlocal count
        count+=1
        return {"orders":[]}
    monkeypatch.setattr(runtime.providers,"complete",loop); monkeypatch.setattr(tools,"call",query)
    await runtime.execute(store,store.run(rid,1),1,"synthetic-grant")
    assert store.run(rid,1)["status"]=="FAILED" and count==4
