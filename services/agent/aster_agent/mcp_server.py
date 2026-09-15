"""Real MCP Streamable HTTP server using the official pinned Python SDK v1 maintenance line."""
from mcp.server.fastmcp import FastMCP, Context
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from .business import java, BusinessError

mcp = FastMCP("Aster Commerce", stateless_http=True, json_response=True,
              transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=True,
                  allowed_hosts=["commerce-mcp:8011", "localhost:*", "127.0.0.1:*"], allowed_origins=[]))


async def invoke(ctx: Context, path: str, body=None):
    request = ctx.request_context.request
    execution = request.headers.get("x-aster-execution", "") if request else ""
    if not execution:
        raise ToolError("缺少短期执行上下文")
    try:
        return await java("/aster/internal/agent" + path, execution=execution, body=body)
    except BusinessError as exc:
        raise ToolError(str(exc)) from exc


@mcp.tool()
async def list_my_orders(ctx: Context) -> dict:
    """查询当前客户最近二十笔订单，只返回本人数据。"""
    return {"orders": await invoke(ctx, "/orders")}


@mcp.tool()
async def get_my_order(order_id: int, ctx: Context) -> dict:
    """按订单 ID 查询本人订单，包含金额、状态、商品，不含地址和联系方式。"""
    return {"order": await invoke(ctx, f"/orders/{order_id}")}


@mcp.tool()
async def list_my_after_sales(ctx: Context) -> dict:
    """查询当前客户的售后进度。"""
    rows = await invoke(ctx, "/after-sales")
    keys = {"id", "order_id", "status", "amount", "reason", "decision_note"}
    return {"after_sales": [{k: v for k, v in row.items() if k in keys} for row in rows]}


@mcp.tool()
async def preview_after_sale(order_id: int, reason: str, ctx: Context) -> dict:
    """生成整单售后确认预览。此工具不提交申请，必须等待客户在界面确认。"""
    return {"preview": await invoke(ctx, "/preview", {"orderId": order_id, "reason": reason})}


@mcp.tool()
async def get_operation_status(operation_id: str, ctx: Context) -> dict:
    """核对本人业务操作的持久化状态。"""
    from uuid import UUID
    operation_id = str(UUID(operation_id))
    return {"operation": await invoke(ctx, f"/operations/{operation_id}")}


@mcp.tool()
async def submit_after_sale(operation_id: str, ctx: Context) -> dict:
    """消费已经由客户确认的操作。未经确认、过期或他人的操作一律拒绝；重放不重复创建。"""
    from uuid import UUID
    operation_id = str(UUID(operation_id))
    return {"operation": await invoke(ctx, f"/operations/{operation_id}/execute", {})}


@mcp.tool()
async def search_policies(query: str, ctx: Context) -> dict:
    """检索当前已发布、客户可见的星序政策。只输入政策问题，不包含姓名、地址或电话。返回条款 citation_id；回答须用 [citation_id] 标注依据。零结果或相近条款不代表资格成立或被拒绝。"""
    import time
    from datetime import date
    from langchain_core.documents import Document
    from .knowledge import LexicalIndex
    if not query.strip() or len(query)>500:
        raise ToolError("政策问题须为 1–500 字")
    started=time.monotonic()
    after=0; epoch=None; documents=[]
    for _ in range(100):
        page=await invoke(ctx,f"/policies?after={after}")
        if epoch is not None and page["epoch"]!=epoch:
            raise ToolError("政策版本在检索中发生变化，请重新查询")
        epoch=page["epoch"]
        for row in page["items"]:
            citation=f"P{row['policy_id']}V{row['version']}C{row['clause_no']}"
            documents.append(Document(page_content=row["content"],metadata={
                "doc_id":str(row["family_id"]),"clause_id":citation,"citation_id":citation,
                "policy_id":row["policy_id"],"clause_no":row["clause_no"],"title":row["title"],
                "version":row["version"],"content_hash":row["content_hash"],
                "status":"PUBLISHED","visibility":"CUSTOMER","effective_from":"0001-01-01","effective_to":None}))
        after=page["next"]
        if not page["more"]: break
    else:
        raise ToolError("政策库超出当前检索预算，请联系管理员")
    latest=await invoke(ctx,f"/policies?after={after}")
    if latest["epoch"]!=epoch:
        raise ToolError("政策版本在检索中发生变化，请重新查询")
    import os
    from pathlib import Path
    import httpx
    from .policy_snapshot import snapshot_digest
    metadata={"method":"BM25","degraded":False}
    hits=LexicalIndex(documents,at=date.today()).search(query)
    if os.getenv("ASTER_RETRIEVAL_MODE", "bm25") == "hybrid":
        try:
            digest=snapshot_digest([d.metadata for d in documents])
            async with httpx.AsyncClient(timeout=2.5, trust_env=False) as client:
                response=await client.post("http://retrieval-worker:8020/search",
                    headers={"X-Aster-Index":Path("/run/secrets/index_key").read_text().strip()},
                    json={"query":query,"epoch":epoch,"digest":digest})
                response.raise_for_status()
                result=response.json()
            valid={d.metadata["citation_id"]:{"text":d.page_content,**d.metadata} for d in documents}
            ids=result["ids"]
            if result["epoch"]!=epoch or len(ids)>5 or len(ids)!=len(set(ids)) or any(k not in valid for k in ids):
                raise ValueError("Invalid retrieval generation")
            hits=[valid[k] for k in ids]
            metadata={"method":"HYBRID_RRF_RERANK","degraded":False,"index_generation":result.get("index_generation")}
        except (httpx.HTTPError,OSError,ValueError,KeyError,TypeError):
            metadata={"method":"BM25","degraded":True,"reason":"混合检索暂不可用，已使用当前有效政策的关键词检索"}
    if (await invoke(ctx,f"/policies?after={after}"))["epoch"]!=epoch:
        raise ToolError("政策版本在检索中发生变化，请重新查询")
    return {"evidence":hits,"retrieval":metadata|{"clauses":len(documents),"epoch":epoch,"elapsed_ms":round((time.monotonic()-started)*1000)}}


@mcp.tool()
async def get_policy_source(policy_id: int, version: int, ctx: Context) -> dict:
    """宿主引用校验：重新读取仍然有效的客户政策，草稿、撤回与旧版本拒绝访问。"""
    return {"policy":await invoke(ctx,f"/policies/{policy_id}?version={version}")}


app = mcp.streamable_http_app()
