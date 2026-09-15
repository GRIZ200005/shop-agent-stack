"""Run with repository mounted: pytest evaluation/test_agent_evaluation.py."""
import importlib.util
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location("agent_evaluator",Path(__file__).parents[1]/"scripts/evaluate-agent.py")
evaluator=importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluator)


def test_wrong_order_cannot_be_hidden_by_a_correct_read():
    calls=[{"name":"get_my_order","order_id":202},{"name":"get_my_order","order_id":101}]
    assert not evaluator.score({"required_order":101},calls,"COMPLETED")["order_selection"]


def test_failed_runs_and_unrequested_previews_fail_contract():
    assert not evaluator.score({},[],"FAILED")["run_finished"]
    assert not evaluator.score({"forbid_preview":True},[{"name":"preview_after_sale"}],"COMPLETED")["no_unrequested_preview"]
    assert not evaluator.score({"require_preview":True},[],"WAITING_CONFIRMATION")["preview_waits_for_confirmation"]


def test_partial_runs_not_counted_as_success_and_unknown_usage_explicit():
    row={"arm":"task","scenario":"s","repeat":0,"expected_turns":2,"checks":{"ok":True},"elapsed_ms":1,"reported_tokens":None}
    summary=evaluator.summarize([row])["task"]
    assert summary["scenario_contract_passed"]==0
    assert summary["turns_without_token_usage"]==1 and summary["answer_correctness"] is None


def test_invalid_labels_rejected():
    with pytest.raises(ValueError): evaluator.validate([])
    with pytest.raises(ValueError): evaluator.validate([{"id":"a","split":"dev","turns":[{"input":"x","expect":{"fake":True}}]}])


def test_saved_config_readonly_and_owner_binding(tmp_path,monkeypatch):
    import json
    from types import SimpleNamespace
    from cryptography.fernet import Fernet
    key=Fernet.generate_key(); keyfile=tmp_path/"key"; keyfile.write_bytes(key)
    blob=Fernet(key).encrypt(json.dumps({"member":7,"id":"deepseek","model":"test","key":"synthetic","url":"https://example.com"}).encode())
    class DB:
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def execute(self,query,params):
            assert "SELECT ciphertext" in query and params[1]=="deepseek"
            return self
        def fetchone(self): return (blob,)
    def connect(database,**kwargs):
        assert database.endswith("?mode=ro") and kwargs=={"uri":True}
        return DB()
    monkeypatch.setattr(evaluator.sqlite3,"connect",connect)
    monkeypatch.setattr(evaluator,"Path",lambda _:keyfile)
    assert evaluator.model_config(SimpleNamespace(live=True,saved_member=7,provider="deepseek"))["model"]=="test"
    with pytest.raises(ValueError): evaluator.model_config(SimpleNamespace(live=True,saved_member=8,provider="deepseek"))
