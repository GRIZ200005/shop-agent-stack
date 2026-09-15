"""Opt-in local integration; uses only synthetic policies and never calls a model provider."""
import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4
import httpx
import pytest
from aster_agent import tools
from aster_agent.business import identity
from test_mcp_integration import customer

pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(os.getenv("ASTER_P3C_LIVE") != "true", reason="explicit local hybrid integration")]


async def test_hybrid_availability():
    expected_outage = os.getenv("ASTER_P3C_OUTAGE") == "true"
    auth = await identity(await customer())
    async with tools.connect(auth["executionToken"]) as session:
        for _ in range(45):
            result = await tools.call(session, "search_policies", {"query":"星序商城售后申请资格说明 未付款订单"})
            if expected_outage or result["retrieval"]["method"] == "HYBRID_RRF_RERANK":
                break
            await asyncio.sleep(1)
        assert result["retrieval"]["degraded"] == expected_outage
        assert result["retrieval"]["method"] == ("BM25" if expected_outage else "HYBRID_RRF_RERANK")
        assert result["evidence"]
        for hit in result["evidence"]:
            source = await tools.call(session, "get_policy_source", {"policy_id":hit["policy_id"],"version":hit["version"]})
            assert any(c["content_hash"] == hit["content_hash"] for c in source["policy"]["clauses"])


async def test_publication_revision_withdrawal_and_index_isolation():
    key = Path("/run/secrets/index_key").read_text().strip()
    accounts = json.loads(Path("/run/secrets/test_accounts").read_text(encoding="utf-8-sig"))
    admin = next(a for a in accounts if a["role"] == "ADMIN")
    async with httpx.AsyncClient(timeout=20, trust_env=False) as http:
        login = (await http.post("http://admin:8080/admin/login", json={"username":admin["username"], "password":admin["password"]})).json()
        assert login["code"] == 200
        headers = {"Authorization":login["data"]["tokenHead"] + login["data"]["token"]}
        private = {"X-Aster-Index":key}
        async def call(path, body=None):
            response = await http.request("GET" if body is None else "POST", "http://admin:8080/aster" + path, headers=headers, json=body)
            result = response.json()
            assert result["code"] == 200
            return result.get("data")
        async def state():
            res = await http.get("http://portal:8085/aster/internal/agent/index/state", headers=private)
            body = res.json()
            assert body["code"] == 200
            return body["data"]
        async def settled():
            epoch = (await state())["epoch"]
            for _ in range(120):
                current = (await http.get("http://retrieval-worker:8020/status", headers=private)).json()
                if current.get("ready") and current.get("epoch") == epoch:
                    latest = await state()
                    assert next(j for j in latest["jobs"] if j["revision"] == epoch)["status"] == "READY"
                    return current
                await asyncio.sleep(1)
            pytest.fail("Index did not settle; inspect authenticated worker status")
        unauthorized = await http.get("http://portal:8085/aster/internal/agent/index/state")
        assert unauthorized.status_code != 200 or unauthorized.json().get("code") != 200
        auth = await identity(await customer())
        title = "P3c状态机验收 " + uuid4().hex
        ids = []
        try:
            first = await call("/policies", {"title":title, "content":"验收政策：先核实整单实付金额。", "visibility":"CUSTOMER"})
            hidden = await call("/policies", {"title":title + "内部", "content":"仅内部专用验收条款。", "visibility":"STAFF"})
            ids.extend([first, hidden])
            await call(f"/policies/{first}/publish", {})
            await call(f"/policies/{hidden}/publish", {})
            first_state = await settled()
            before = (await state())["epoch"]
            repeated = await http.post(f"http://admin:8080/aster/policies/{first}/publish", headers=headers, json={})
            assert repeated.json()["code"] != 200
            assert (await state())["epoch"] == before
            async with tools.connect(auth["executionToken"]) as session:
                async def hybrid():
                    for _ in range(15):
                        result = await tools.call(session, "search_policies", {"query":title})
                        if result["retrieval"]["method"] == "HYBRID_RRF_RERANK":
                            return result
                        await asyncio.sleep(1)
                    pytest.fail("Hybrid route remained degraded")
                result = await hybrid()
                assert any(h["policy_id"] == first for h in result["evidence"])
                assert all(h["policy_id"] != hidden for h in result["evidence"])
                # Wrong snapshot cannot query an old generation, even with valid service auth.
                stale = await http.post("http://retrieval-worker:8020/search", headers=private,
                    json={"query":title,"epoch":before-1,"digest":first_state["digest"]})
                assert stale.status_code == 503
                revised = await call(f"/policies/{first}/revise", {"title":title,"content":"新版验收政策：重新核实订单状态与实付金额。","visibility":"CUSTOMER"})
                ids.append(revised)
                await call(f"/policies/{revised}/publish", {})
                immediate = await tools.call(session, "search_policies", {"query":title})
                assert all(h["policy_id"] != first for h in immediate["evidence"])
                await settled()
                assert any(h["policy_id"] == revised for h in (await hybrid())["evidence"])
                await call(f"/policies/{revised}/withdraw", {})
                immediate = await tools.call(session, "search_policies", {"query":title})
                assert all(h["policy_id"] not in [first, revised, hidden] for h in immediate["evidence"])
                await settled()
                assert all(h["policy_id"] not in [first, revised, hidden] for h in (await hybrid())["evidence"])
        finally:
            for policy_id in ids:
                response = await http.post(f"http://admin:8080/aster/policies/{policy_id}/withdraw", headers=headers, json={})
                body = response.json()
                assert body["code"] == 200 or body.get("message") == "仅已发布政策可撤回"
            await settled()
