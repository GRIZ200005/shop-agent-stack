import json
import pytest
from aster_agent.policy_gate import assess_with_retry, parse_assessment

HIT={"citation_id":"P1V1C1","text":"模拟退款不转账","title":"退款"}


@pytest.mark.parametrize("value", ["not json", "[]", '{"decision":"sufficient","evidence_ids":["P999V1C1"]}',
    '{"decision":"clarify","missing_fields":["password"]}', '{"decision":"retry","query":""}'])
def test_invalid_or_unsafe_judgment_never_authorizes_answer(value):
    assert parse_assessment(value,[HIT])["decision"] == "insufficient"


def test_single_json_fence_preserves_evidence_validation():
    valid = '{"decision":"sufficient","evidence_ids":["P1V1C1"]}'
    assert parse_assessment('```json\n' + valid + '\n```', [HIT])["decision"] == "sufficient"
    assert parse_assessment('```json\n' + valid.replace('P1V1C1', 'P999V1C1') + '\n```', [HIT])["reason"] == "invalid_assessment"
    for value in [None, 'null', '1', '"text"', 'Explanation\n' + valid, valid[:-1]]:
        assert parse_assessment(value, [HIT])["reason"] == "invalid_assessment"


@pytest.mark.asyncio
async def test_retry_merges_evidence_and_stops_after_one_supplement():
    searches=[]; events=[]; judges=[]
    async def judge(payload):
        judges.append(payload)
        return json.dumps({"decision":"retry","query":"换一种问法" if len(judges)==1 else "再换一种问法"})
    async def retrieve(query):
        searches.append(query)
        return [HIT]
    result=await assess_with_retry("问题",[],[],"原问题",judge,retrieve,events.append)
    assert searches == ["换一种问法"]
    assert len(judges)==2 and len(result["evidence"])==1
    assert result["decision"]=="insufficient" and result["reason"]=="retry_budget_exhausted"
    assert [e["decision"] for e in events]==["retry","insufficient"]


@pytest.mark.asyncio
async def test_supplement_can_supply_missing_evidence():
    async def judge(payload):
        if not payload["evidence"]: return '{"decision":"retry","query":"退款"}'
        return '{"decision":"sufficient","evidence_ids":["P1V1C1"]}'
    async def retrieve(query): return [HIT]
    result=await assess_with_retry("问题",[],[],"原问题",judge,retrieve,lambda e:None)
    assert result["decision"]=="sufficient" and result["attempts"]==2


@pytest.mark.asyncio
async def test_clarification_does_not_search_again():
    async def judge(payload): return '{"decision":"clarify","missing_fields":["usage"]}'
    async def retrieve(query): pytest.fail("Must not retrieve after clarification")
    result=await assess_with_retry("开封能退吗",[],[HIT],"退款",judge,retrieve,lambda e:None)
    assert result["decision"]=="clarify" and result["attempts"]==1
