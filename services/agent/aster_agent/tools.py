from contextlib import asynccontextmanager
import json
import os
import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

MODEL_TOOLS = {"list_my_orders", "get_my_order", "list_my_after_sales", "preview_after_sale", "get_operation_status", "search_policies"}


@asynccontextmanager
async def connect(execution: str):
    # The transport lives for the whole run and carries immutable per-run identity.
    async with httpx.AsyncClient(headers={"X-Aster-Execution": execution}, timeout=20, trust_env=False) as client:
        async with streamable_http_client(os.getenv("ASTER_MCP_URL", "http://commerce-mcp:8011/mcp"), http_client=client) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session


async def call(session: ClientSession, name: str, arguments: dict) -> dict:
    result = await session.call_tool(name, arguments)
    if result.isError:
        message = " ".join(c.text for c in result.content if hasattr(c, "text"))
        raise ValueError(message[:300] or "工具调用失败")
    if result.structuredContent is not None:
        return result.structuredContent
    return json.loads(next(c.text for c in result.content if hasattr(c, "text")))
