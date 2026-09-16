"""Explicit, no-model integration against the local synthetic catalog."""
import os
import pytest
from test_mcp_integration import customer
from shop_agent_stack.business import identity, java, BusinessError
from shop_agent_stack import tools

pytestmark=[pytest.mark.asyncio,pytest.mark.skipif(os.getenv("SHOP_AGENT_STACK_INTEGRATION")!="true",reason="requires local catalog")]


async def test_live_catalog_transport_filters_snapshot_and_grant():
    with pytest.raises(BusinessError):
        await java("/shop_agent_stack/internal/agent/products/10001",execution="invalid-synthetic-grant")
    auth=await identity(await customer())
    async with tools.connect(auth["executionToken"]) as session:
        found=await tools.call(session,"search_products",{"query":"玻璃 杯","max_price":50})
        assert {p["id"] for p in found["products"]}=={10002}
        product=found["products"][0]
        detail=(await tools.call(session,"get_product",{"product_id":10002}))["product"]
        assert product["snapshot"]==detail["snapshot"]
        assert detail["skus"] and detail["skus"][0]["available_stock"]>=0
        assert not (await tools.call(session,"search_products",{"query":"不存在的月球发动机"}))["products"]
        with pytest.raises(ValueError):
            await tools.call(session,"search_products",{"min_price":100,"max_price":1})
        with pytest.raises(ValueError):
            await tools.call(session,"get_product",{"product_id":99999999})
