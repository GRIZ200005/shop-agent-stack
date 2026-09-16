import os
import httpx

PORTAL = os.getenv("SHOP_AGENT_STACK_PORTAL_URL", "http://portal:8085")


class BusinessError(Exception):
    def __init__(self, message: str, code: int = 400):
        super().__init__(message)
        self.code = code


async def java(path: str, *, bearer: str = "", execution: str = "", body=None):
    headers = {}
    if bearer:
        headers["Authorization"] = bearer
    if execution:
        headers["X-ShopAgentStack-Execution"] = execution
    try:
        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            response = await client.request("POST" if body is not None else "GET", PORTAL + path, headers=headers, json=body)
            result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise BusinessError("业务服务暂不可用，请稍后核实结果", 503) from exc
    if result.get("code") != 200:
        raise BusinessError(result.get("message", "业务操作被拒绝"), result.get("code", 400))
    return result.get("data")


async def identity(bearer: str):
    if not bearer.startswith("Bearer "):
        raise BusinessError("请先登录客户账户", 401)
    # A short-lived Java-issued grant is the only identity sent to MCP. Never send JWTs to models.
    return await java("/shop_agent_stack/agent/context", bearer=bearer, body={})
