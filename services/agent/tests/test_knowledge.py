from datetime import date
import pytest
from langchain_core.documents import Document
from aster_agent.knowledge import LexicalIndex


def doc(**changes):
    return Document(page_content="退款使用实付金额。", metadata={"doc_id":"p1", "clause_id":"p1-c1", "version":1,
        "title":"退款金额", "visibility":"CUSTOMER", "status":"PUBLISHED", "effective_from":"2026-09-01",
        "effective_to":None, **changes})


@pytest.mark.parametrize("changes", [{"status":"DRAFT"}, {"status":"WITHDRAWN"}, {"visibility":"STAFF"},
    {"effective_from":"2026-10-01"}, {"effective_to":"2026-09-15"}, {"effective_from":None}])
def test_visibility_and_effective_date_before_retrieval(changes):
    index = LexicalIndex([doc(**changes)], at=date(2026,9,15))
    assert index.search("退款金额") == []


def test_overlapping_versions_fail_closed():
    with pytest.raises(ValueError, match="Overlapping"):
        LexicalIndex([doc(), doc(version=2)], at=date(2026,9,15))


def test_retrieval_returns_traceable_clause_and_no_zero_match():
    index = LexicalIndex([doc()], at=date(2026,9,15))
    assert index.search("退款金额")[0]["clause_id"] == "p1-c1"
    assert index.search("火星天气") == []
    with pytest.raises(ValueError): index.search("退款", k=100)


def test_preview_is_explicit_and_never_includes_staff():
    index = LexicalIndex([doc(status="DRAFT"), doc(doc_id="p2", clause_id="p2-c1", visibility="STAFF")],
                         at=date(2026,9,15), draft_preview=True)
    assert len(index.documents) == 1
