"""Synthetic fixture helper for sequential local RabbitMQ fault verification; no LLM calls."""
import asyncio
import json
from pathlib import Path
import sys
import httpx

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"services/agent"))
sys.path.insert(0,str(ROOT/"services/agent/tests"))
from test_mcp_integration import customer,paid_order
from shop_agent_stack.business import java


async def main():
    account=next(a for a in json.loads((ROOT/".local/p1-accounts.json").read_text(encoding="utf-8-sig")) if a["role"]=="SERVICE")
    async with httpx.AsyncClient(base_url="http://admin:8080",timeout=20) as client:
        login=(await client.post("/admin/login",json={k:account[k] for k in ("username","password")})).json()
        assert login["code"]==200,"Staff login failed"
        client.headers["Authorization"]=login["data"]["tokenHead"]+login["data"]["token"]
        if sys.argv[1]=="prepare":
            bearer=await customer(); oid=await paid_order(bearer)
            sale=await java("/shop_agent_stack/after-sales",bearer=bearer,body={"orderId":oid,"reason":"P4 isolated recovery verification"})
            cid=sale["id"]
            claims=await asyncio.gather(*(client.post(f"/shop_agent_stack/after-sales/{cid}/claim",json={}) for _ in range(2)))
            assert sum(r.json()["code"]==200 for r in claims)==1,"Concurrent claim must have one winner"
            (ROOT/".local/p4-fixture.json").write_text(json.dumps({"case_id":cid,"order_id":oid}),encoding="utf-8")
            print("Synthetic case prepared; concurrent claim has one winner. No credentials saved.")
        else:
            cid=json.loads((ROOT/".local/p4-fixture.json").read_text())["case_id"]
            decisions=await asyncio.gather(*(client.post(f"/shop_agent_stack/after-sales/{cid}/decision",json={"approved":True,"note":"P4 MQ outage verification"}) for _ in range(2)))
            assert sum(r.json()["code"]==200 for r in decisions)==1,"Concurrent approval must have one winner"
            sale=(await client.get(f"/shop_agent_stack/after-sales/{cid}")).json()["data"]
            assert sale["status"]=="REFUNDING","Offline broker must not produce successful refund"
            print("Concurrent approval has one winner; refund remains pending during broker outage.")


if __name__=="__main__": asyncio.run(main())
