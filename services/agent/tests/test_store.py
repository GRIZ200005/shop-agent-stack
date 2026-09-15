from concurrent.futures import ThreadPoolExecutor
import pytest
from aster_agent.store import Store, StoreError
from aster_agent.providers import public_providers, complete


def test_isolation_idempotency_and_single_active_run(tmp_path):
    store=Store(str(tmp_path/"test.sqlite"))
    sid=store.new_session(1)["id"]
    with pytest.raises(StoreError): store.session(sid,2)
    rid,created=store.create_run(sid,1,"request1","hello","fixture")
    assert created
    assert store.create_run(sid,1,"request1","hello","fixture")== (rid,False)
    with pytest.raises(StoreError): store.create_run(sid,1,"request2","hello","fixture")
    with pytest.raises(StoreError): store.run(rid,2)


def test_only_one_confirmation_wins(tmp_path):
    store=Store(str(tmp_path/"test.sqlite"))
    sid=store.new_session(1)["id"]
    rid,_=store.create_run(sid,1,"r","x","fixture")
    store.state(rid,"WAITING_CONFIRMATION")
    def confirm():
        try: store.begin_confirm(rid); return True
        except StoreError: return False
    with ThreadPoolExecutor(2) as pool:
        assert sum(pool.map(lambda _:confirm(),range(2)))==1


def test_stop_blocks_confirmation_and_replay_cursor(tmp_path):
    store=Store(str(tmp_path/"test.sqlite"))
    sid=store.new_session(1)["id"]
    rid,_=store.create_run(sid,1,"r","x","fixture")
    store.state(rid,"WAITING_CONFIRMATION")
    cursor=store.events(rid)[-1]["id"]
    store.begin_stop(rid)
    with pytest.raises(StoreError): store.begin_confirm(rid)
    store.state(rid,"STOPPED")
    assert len(store.events(rid,cursor))==1


def test_restart_does_not_replay_writes(tmp_path):
    path=str(tmp_path/"test.sqlite")
    store=Store(path)
    sid=store.new_session(1)["id"]
    rid,_=store.create_run(sid,1,"r","x","fixture")
    store.state(rid,"WAITING_CONFIRMATION")
    store.begin_confirm(rid)
    recovered=Store(path)
    assert recovered.run(rid,1)["status"]=="UNCERTAIN"


@pytest.mark.asyncio
async def test_no_silent_test_fallback(monkeypatch):
    monkeypatch.delenv("ASTER_ENABLE_TEST_PROVIDER",raising=False)
    monkeypatch.setenv("ASTER_OPENAI_API_KEY","synthetic-secret-do-not-expose")
    public=public_providers()
    assert not any(p["id"]=="fixture" for p in public)
    assert "synthetic-secret" not in str(public)
    with pytest.raises(ValueError): await complete("fixture",[],[])
