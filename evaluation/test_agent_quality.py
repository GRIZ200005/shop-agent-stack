import importlib.util
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location("quality",Path(__file__).parents[1]/"scripts/audit-agent-quality.py")
quality=importlib.util.module_from_spec(spec); spec.loader.exec_module(quality)


def row(turn=1):
    return {"scenario":"case","repeat":0,"arm":"task","turn":turn,"status":"COMPLETED","checks":{"run_finished":True},"answer_for_local_review":"本次未能完成政策证据核查，请稍后重试。"}


def test_success_status_does_not_hide_answer_failure():
    assert quality.signals(row())["evidence_check_error"]
    result=quality.aggregate([row()],[])["task"]
    assert result["human_review"]["answer_correct"]["full_sample_rate"] is None


def test_partial_annotation_is_not_full_accuracy():
    review={k:row()[k] for k in ("scenario","repeat","arm","turn")}
    review.update(reviewer="synthetic-test-reviewer",reviewer_type="human",answer_correct=True)
    metric=quality.aggregate([row(),row(2)],[review])["task"]["human_review"]["answer_correct"]
    assert metric["coverage"]==.5 and metric["pass_rate_on_reviewed"]==1 and metric["full_sample_rate"] is None


def test_duplicate_unknown_and_unattributed_labels_rejected():
    with pytest.raises(ValueError): quality.aggregate([row(),row()],[])
    review={k:row()[k] for k in ("scenario","repeat","arm","turn")}
    review["answer_correct"]=True
    with pytest.raises(ValueError): quality.aggregate([row()],[review])
    review.update(reviewer="test",reviewer_type="human",turn=99)
    with pytest.raises(ValueError): quality.aggregate([row()],[review])
