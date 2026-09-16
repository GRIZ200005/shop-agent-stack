"""Explicit local integration: real SDK transport -> real Java -> synthetic MySQL orders."""
import asyncio
import os
from uuid import uuid4
import httpx
import pytest
from shop_agent_stack.business import java, identity, BusinessError, PORTAL
from shop_agent_stack import tools

pytestmark=[pytest.mark.asyncio,pytest.mark.skipif(os.getenv("SHOP_AGENT_STACK_INTEGRATION")!="true",reason="requires local P2 services")]


async def customer():
    name="p2_"+uuid4().hex[:14]
    phone="000"+str(int(uuid4().hex[:7],16)).zfill(8)[-8:]
    async with httpx.AsyncClient(base_url=PORTAL) as client:
        otp=(await client.get("/sso/getAuthCode",params={"telephone":phone})).json()["data"]
        data={"username":name,"password":uuid4().hex+"Aa9!","telephone":phone,"authCode":otp}
        assert (await client.post("/sso/register",data=data)).json()["code"]==200
        login=(await client.post("/sso/login",data={k:data[k] for k in ("username","password")})).json()["data"]
        return login["tokenHead"]+login["token"]


async def paid_order(bearer):
    await java("/member/address/add",bearer=bearer,body={"name":"Synthetic","phoneNumber":"00000000000","defaultStatus":0,"province":"Test","city":"Test","region":"Test","detailAddress":"Fixture"})
    address=(await java("/member/address/list",bearer=bearer))[0]["id"]
    await java("/cart/add",bearer=bearer,body={"productId":1,"productSkuId":1,"quantity":1,"price":0.01,"productName":"ShopAgentStack USB-C Cable","productCategoryId":1})
    cart=await java("/cart/list",bearer=bearer)
    order=await java("/order/generateOrder",bearer=bearer,body={"memberReceiveAddressId":address,"payType":0,"cartIds":[c["id"] for c in cart]})
    oid=order["order"]["id"]
    await java(f"/shop_agent_stack/orders/{oid}/simulate-payment",bearer=bearer,body={})
    return oid


async def test_published_library_mcp_retrieval_and_source():
    bearer = await customer()
    rows = await java("/shop_agent_stack/policies", bearer=bearer)
    title = "ShopAgentStack 商城售后申请资格说明"
    policy = next((p for p in rows if p["title"] == title), None)
    if policy is None:
        pytest.skip("requires explicit policy library import")
    auth = await identity(bearer)
    async with tools.connect(auth["executionToken"]) as session:
        result = await tools.call(session, "search_policies", {"query": title + " 待付款或已关闭订单"})
        assert result["retrieval"]["clauses"] >= 240
        hit = next(h for h in result["evidence"] if h["policy_id"] == policy["id"])
        source = await tools.call(session, "get_policy_source", {"policy_id": policy["id"], "version": policy["version"]})
        assert any(c["clause_no"] == hit["clause_no"] and c["content_hash"] == hit["content_hash"] for c in source["policy"]["clauses"])


async def test_real_mcp_confirmation_ownership_and_replay():
    a,b=await customer(),await customer()
    oid=await paid_order(a)
    auth,other=await identity(a),await identity(b)
    async with tools.connect(auth["executionToken"]) as session:
        discovered=await session.list_tools()
        assert {t.name for t in discovered.tools}==tools.MODEL_TOOLS|{"submit_after_sale", "get_policy_source"}
        assert "submit_after_sale" not in tools.MODEL_TOOLS
        orders=await tools.call(session,"list_my_orders",{})
        assert any(o["id"]==oid for o in orders["orders"])
        assert all("receiver_phone" not in o and "member_id" not in o for o in orders["orders"])
        preview=(await tools.call(session,"preview_after_sale",{"order_id":oid,"reason":"Synthetic integration reason"}))["preview"]
        assert float(preview["amount"])==49.9 and preview["expired"] is False
        competing=(await tools.call(session,"preview_after_sale",{"order_id":oid,"reason":"A distinct pending preview"}))["preview"]
        with pytest.raises(ValueError): await tools.call(session,"submit_after_sale",{"operation_id":preview["id"]})
        with pytest.raises(BusinessError): await java(f"/shop_agent_stack/agent/operations/{preview['id']}/confirm",bearer=a,body={"confirmationToken":"wrong-confirmation"})
        async with tools.connect(other["executionToken"]) as stranger:
            with pytest.raises(ValueError): await tools.call(stranger,"get_my_order",{"order_id":oid})
            with pytest.raises(ValueError): await tools.call(stranger,"submit_after_sale",{"operation_id":preview["id"]})
        await java(f"/shop_agent_stack/agent/operations/{preview['id']}/confirm",bearer=a,body={"confirmationToken":preview["confirmationToken"]})
        first,second=await asyncio.gather(tools.call(session,"submit_after_sale",{"operation_id":preview["id"]}),tools.call(session,"submit_after_sale",{"operation_id":preview["id"]}))
        assert first["operation"]["status"]=="SUCCEEDED"
        assert first["operation"]["case_id"]==second["operation"]["case_id"]
        await java(f"/shop_agent_stack/agent/operations/{competing['id']}/confirm",bearer=a,body={"confirmationToken":competing["confirmationToken"]})
        with pytest.raises(ValueError): await tools.call(session,"submit_after_sale",{"operation_id":competing["id"]})
        cases=(await tools.call(session,"list_my_after_sales",{}))["after_sales"]
        assert len([s for s in cases if s["order_id"]==oid])==1


async def test_cancelled_operation_and_invalid_execution_grant():
    bearer=await customer(); oid=await paid_order(bearer); auth=await identity(bearer)
    async with tools.connect(auth["executionToken"]) as session:
        preview=(await tools.call(session,"preview_after_sale",{"order_id":oid,"reason":"Cancellation fixture"}))["preview"]
        await java(f"/shop_agent_stack/agent/operations/{preview['id']}/cancel",bearer=bearer,body={})
        with pytest.raises(ValueError): await tools.call(session,"submit_after_sale",{"operation_id":preview["id"]})
        with pytest.raises(BusinessError): await java(f"/shop_agent_stack/agent/operations/{preview['id']}/confirm",bearer=bearer,body={"confirmationToken":preview["confirmationToken"]})
    async with tools.connect("invalid-synthetic-grant") as session:
        with pytest.raises(ValueError): await tools.call(session,"list_my_orders",{})
