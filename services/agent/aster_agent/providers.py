"""Server-configured provider gateway. Model selection never accepts a browser-supplied URL/key."""
import asyncio
import json
import os
import re
from urllib.parse import urlsplit
import httpx

PRESETS = {"deepseek": ("DeepSeek", "https://api.deepseek.com"), "openai": ("OpenAI", "https://api.openai.com/v1"),
           "kimi": ("Kimi", "https://api.moonshot.cn/v1"), "custom": ("自定义兼容接口", "")}


def settings(provider: str):
    if provider not in PRESETS:
        raise ValueError("未知模型供应商")
    prefix = "ASTER_" + provider.upper()
    label, default_url = PRESETS[provider]
    return {"id": provider, "label": label, "model": os.getenv(prefix + "_MODEL", ""),
            "key": os.getenv(prefix + "_API_KEY", ""), "url": os.getenv(prefix + "_BASE_URL", "") or default_url}


def public_providers():
    result = []
    for name in PRESETS:
        config = settings(name)
        result.append({k: config[k] for k in ("id", "label", "model")} | {"configured": bool(config["key"] and config["model"] and config["url"]), "test": False})
    if os.getenv("ASTER_ENABLE_TEST_PROVIDER") == "true":
        result.append({"id": "fixture", "label": "回归测试引擎（非 AI）", "model": "deterministic-fixture", "configured": True, "test": True})
    return result


async def complete(provider: str, messages: list, tools: list, config=None, on_delta=None):
    if provider == "fixture":
        if os.getenv("ASTER_ENABLE_TEST_PROVIDER") != "true":
            raise ValueError("测试引擎未启用")
        result = await fixture(messages)
        if on_delta and result[0].get("content"):
            await on_delta(result[0]["content"])
        return result
    config = config or settings(provider)
    if not config["key"] or not config["model"] or not config["url"]:
        raise ValueError("模型尚未配置，请在服务端配置个人 API 密钥、模型名及地址")
    parsed = urlsplit(config["url"])
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("模型地址必须是无凭据、无查询参数的 HTTPS 基础地址")
    body = {"model": config["model"], "messages": messages}
    if tools:
        body.update(tools=tools, tool_choice="auto")
    body["max_completion_tokens" if provider == "openai" else "max_tokens"] = 1024
    if provider == "openai":
        body["store"] = False
    from .outbound import PublicTransport
    transport = PublicTransport() if config.get("personal") else None
    async with httpx.AsyncClient(timeout=40, follow_redirects=False, trust_env=False, **({"transport": transport} if transport else {})) as client:
        if on_delta:
            body["stream"] = True
            body["stream_options"] = {"include_usage": True}
            async with client.stream("POST", config["url"].rstrip("/") + "/chat/completions", headers={"Authorization": "Bearer " + config["key"]}, json=body) as response:
                if response.status_code != 200:
                    raise ValueError(f"模型服务返回 HTTP {response.status_code}，请检查模型设置")
                return await read_stream(response, on_delta)
        response = await client.post(config["url"].rstrip("/") + "/chat/completions", headers={"Authorization": "Bearer " + config["key"]}, json=body)
    if response.status_code != 200:
        # Never forward provider bodies: they may contain prompts, tokens or infrastructure details.
        raise ValueError(f"模型服务返回 HTTP {response.status_code}，请检查服务端配置或稍后重试")
    data = response.json()
    choice = data["choices"][0]
    raw = choice["message"]
    # Provider reasoning state, when required for tool round trips, stays in memory and is never displayed or persisted.
    message = {k: raw[k] for k in ("role", "content", "tool_calls", "reasoning_content") if k in raw}
    return message, data.get("usage", {})


async def read_stream(response, on_delta):
    """Reassemble SSE tool calls; reasoning is memory-only and never a UI event."""
    message = {"role": "assistant", "content": ""}
    calls, usage, finish, done = {}, {}, None, False
    size = 0
    async for line in response.aiter_lines():
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            done = True
            break
        try:
            data = json.loads(payload)
        except (ValueError, TypeError):
            raise ValueError("模型返回了无效的流式数据") from None
        if data.get("error"):
            raise ValueError("模型流式响应失败，请稍后重试")
        usage = data.get("usage") or usage
        for choice in data.get("choices", []):
            if choice.get("index", 0) != 0:
                continue
            finish = choice.get("finish_reason") or finish
            delta = choice.get("delta") or {}
            for field in ("content", "reasoning_content"):
                value = delta.get(field) or ""
                size += len(value)
                if size > 200000:
                    raise ValueError("模型响应过长，请缩小问题范围")
                if value:
                    message[field] = message.get(field, "") + value
                    if field == "content":
                        await on_delta(value)
            for part in delta.get("tool_calls") or []:
                call = calls.setdefault(part["index"], {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                call["id"] += part.get("id") or ""
                for key in ("name", "arguments"):
                    value = (part.get("function") or {}).get(key) or ""
                    size += len(value)
                    call["function"][key] += value
                if size > 200000 or len(calls) > 8:
                    raise ValueError("模型工具响应超出执行预算")
    if not done or finish not in ("stop", "tool_calls"):
        raise ValueError("模型回答未完整结束，已保留收到的内容，请重试或缩小问题范围")
    if calls:
        message["tool_calls"] = [calls[k] for k in sorted(calls)]
    return message, usage


async def fixture(messages):
    """Only explicit test configuration enables this deterministic engine; never a live-model fallback."""
    user = next(m["content"] for m in reversed(messages) if m["role"] == "user")
    if messages[0].get("content", "").startswith("ASTER_POLICY_ASSESSMENT_V1"):
        payload=json.loads(user)
        question=payload["question"]
        hits=payload["evidence"]
        decision={"decision":"sufficient" if hits else "insufficient","evidence_ids":[h["citation_id"] for h in hits],"missing_fields":[],"query":""}
        if "测试补问" in question:
            decision.update(decision="clarify",evidence_ids=[],missing_fields=["usage"])
        elif "测试证据不足" in question:
            decision.update(decision="insufficient",evidence_ids=[])
        elif "测试补查" in question and "测试补查" in payload["query"]:
            decision.update(decision="retry",evidence_ids=[],query="星序商城整单售后申请范围指引")
        return {"role":"assistant","content":json.dumps(decision,ensure_ascii=False)},{}
    if "测试慢响应" in user:
        await asyncio.sleep(8)
    if messages[-1]["role"] == "tool":
        result=json.loads(messages[-1]["content"])
        if "evidence" in result:
            hits=result["evidence"]
            text=(hits[0]["text"]+" ["+hits[0]["citation_id"]+"]") if hits else "没有找到足够的已发布政策证据，暂时无法判断。"
            return {"role":"assistant","content":text},{}
        return {"role": "assistant", "content": "测试引擎已完成真实业务工具查询，请查看下方业务卡片。"}, {}
    if "政策" in user:
        name,args="search_policies",{"query":user}
    elif "申请售后" in user:
        match = re.search(r"订单\s*#?(\d+).*?原因[：:]\s*(.+)", user)
        if not match:
            return {"role": "assistant", "content": "请提供订单 ID 和售后原因。"}, {}
        name, args = "preview_after_sale", {"order_id": int(match[1]), "reason": match[2]}
    elif "售后" in user:
        name, args = "list_my_after_sales", {}
    elif re.search(r"订单\s*#?(\d+)", user):
        name, args = "get_my_order", {"order_id": int(re.search(r"订单\s*#?(\d+)", user)[1])}
    else:
        name, args = "list_my_orders", {}
    return {"role": "assistant", "content": None, "tool_calls": [{"id": "fixture_call", "type": "function", "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}]}, {}
