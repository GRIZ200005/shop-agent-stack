from concurrent.futures import ThreadPoolExecutor
import pytest
from shop_agent_stack.store import Store, StoreError
from shop_agent_stack.providers import public_providers, complete


def test_delete_session_is_owner_scoped_and_removes_history(tmp_path):
    store = Store(str(tmp_path / "delete.sqlite"))
    sid = store.new_session(1)["id"]
    other = store.new_session(2)["id"]
    rid, _ = store.create_run(sid, 1, "r", "hello", "fixture")
    store.state(rid, "COMPLETED")
    with store.db() as db:
        db.execute("INSERT INTO task_context VALUES (?,?)", (sid, '{}'))
    with pytest.raises(StoreError) as exc:
        store.delete_session(sid, 2)
    assert exc.value.code == 404
    assert store.delete_session(sid, 1) == {"deleted": True}
    assert store.sessions(1) == [] and store.session(other, 2)
    with store.db() as db:
        assert not db.execute("SELECT 1 FROM events WHERE run_id=?", (rid,)).fetchone()
        assert not db.execute("SELECT 1 FROM task_context WHERE session_id=?", (sid,)).fetchone()
    with pytest.raises(StoreError): store.create_run(sid, 1, "new", "hello", "fixture")


@pytest.mark.parametrize("status", ["QUEUED", "RUNNING", "STOPPING", "WAITING_CONFIRMATION", "CONFIRMING", "UNCERTAIN"])
def test_delete_refuses_active_or_unresolved_operations(tmp_path, status):
    store = Store(str(tmp_path / "protected.sqlite"))
    sid = store.new_session(1)["id"]
    rid, _ = store.create_run(sid, 1, "r", "hello", "fixture")
    store.state(rid, status)
    with pytest.raises(StoreError) as exc: store.delete_session(sid, 1)
    assert exc.value.code == 409
    assert store.run(rid, 1)["status"] == status


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
    monkeypatch.delenv("SHOP_AGENT_STACK_ENABLE_TEST_PROVIDER",raising=False)
    monkeypatch.setenv("SHOP_AGENT_STACK_OPENAI_API_KEY","synthetic-secret-do-not-expose")
    public=public_providers()
    assert not any(p["id"]=="fixture" for p in public)
    assert "synthetic-secret" not in str(public)
    with pytest.raises(ValueError): await complete("fixture",[],[])
