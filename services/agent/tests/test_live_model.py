"""Opt-in, billable real-provider smoke. Never enabled by the fixture test overlay."""
import asyncio
import os
from uuid import uuid4
import httpx
import pytest
from test_mcp_integration import customer, paid_order

PROVIDER=os.getenv("ASTER_LIVE_PROVIDER","")
pytestmark=[pytest.mark.asyncio,pytest.mark.skipif(PROVIDER not in {"deepseek","openai","kimi","custom"},reason="requires explicit real provider selection and credentials")]


async def test_live_order_and_preview():
    bearer=await customer(); oid=await paid_order(bearer)
    async with httpx.AsyncClient(base_url="http://agent:8010",headers={"Authorization":bearer},timeout=20) as client:
        available=(await client.get("/providers")).json()
        assert any(p["id"]==PROVIDER and p["configured"] for p in available), "Provider is not configured"
        sid=(await client.post("/sessions")).json()["id"]
        async def run(text):
            created=await client.post(f"/sessions/{sid}/runs",json={"message":text,"provider":PROVIDER,"request_id":str(uuid4())})
            assert created.status_code==200
            rid=created.json()["id"]
            for _ in range(100):
                result=(await client.get(f"/runs/{rid}")).json()
                if result["status"] not in {"QUEUED","RUNNING"}: return result
                await asyncio.sleep(1)
            pytest.fail("Live model run timed out")
        query=await run(f"请调用工具查询我的订单 {oid}，告诉我实际金额与当前状态。")
        assert query["status"]=="COMPLETED", "Live order query failed; inspect local authenticated run"
        assert any(e["kind"]=="business" and ("order" in e["data"] or "orders" in e["data"]) for e in query["events"])
        preview=await run(f"我要申请售后，订单 {oid}，原因：尺寸不合适。请生成预览，我会在页面确认。")
        assert preview["status"]=="WAITING_CONFIRMATION", "Live preview did not reach confirmation gate"
        assert not any(e["kind"]=="operation" for e in preview["events"])
        cancelled=await client.post(f"/runs/{preview['id']}/stop")
        assert cancelled.json()["status"]=="STOPPED"
