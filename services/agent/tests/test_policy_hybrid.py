import httpx
import pytest
from pathlib import Path
from shop_agent_stack import mcp_server
from shop_agent_stack.policy_snapshot import snapshot_digest

ROW = {"policy_id": 1, "version": 1, "clause_no": 1, "title": "退款", "content": "退款按实付金额办理。",
       "content_hash": "abc", "family_id": 1}


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["ok", "timeout", "forged", "changed"])
async def test_hybrid_validates_generation_and_fails_safe(monkeypatch, mode):
    calls = 0
    async def invoke(ctx, path, body=None):
        nonlocal calls
        calls += 1
        return {"epoch": 2 if mode == "changed" and calls >= 3 else 1,
                "items": [ROW], "next": 1, "more": False}
    monkeypatch.setattr(mcp_server, "invoke", invoke)
    monkeypatch.setenv("SHOP_AGENT_STACK_RETRIEVAL_MODE", "hybrid")
    monkeypatch.setattr(Path, "read_text", lambda *a, **k: "local-test-key")
    original = httpx.AsyncClient
    def handler(request):
        if mode == "timeout":
            raise httpx.ReadTimeout("fixture timeout")
        return httpx.Response(200, json={"ids": ["forged" if mode == "forged" else "P1V1C1"], "epoch": 1})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler)))
    if mode == "changed":
        with pytest.raises(Exception, match="政策版本"):
            await mcp_server.search_policies("退款", None)
    else:
        result = await mcp_server.search_policies("退款", None)
        assert result["retrieval"]["degraded"] == (mode != "ok")
        assert result["evidence"][0]["citation_id"] == "P1V1C1"
        assert result["retrieval"]["method"] == ("HYBRID_RRF_RERANK" if mode == "ok" else "BM25")


def test_snapshot_digest_binds_title_hash_version_and_is_order_independent():
    other = ROW | {"policy_id": 2}
    assert snapshot_digest([ROW, other]) == snapshot_digest([other, ROW])
    for change in ({"version": 2}, {"title": "不同规则"}, {"content_hash": "changed"}):
        assert snapshot_digest([ROW]) != snapshot_digest([ROW | change])
