import json
import httpx
import pytest
from aster_agent import providers


@pytest.mark.asyncio
async def test_assessment_budget_and_finish_reason_are_not_chat_fields(monkeypatch):
    original = httpx.AsyncClient
    def response(request):
        assert json.loads(request.content)["max_tokens"] == 4096
        return httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {
            "role": "assistant", "content": None}}], "usage": {"total_tokens": 4096}})
    monkeypatch.setattr(providers.httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(response), **kw))
    message, usage = await providers.complete("deepseek", [], [], config={
        "key": "synthetic-secret", "model": "test-model", "url": "https://model.example"}, max_output_tokens=4096)
    assert usage["finish_reason"] == "length" and usage["total_tokens"] == 4096
    assert "finish_reason" not in message


@pytest.mark.asyncio
@pytest.mark.parametrize("name",["deepseek","openai","kimi","custom"])
async def test_provider_wire_contract(monkeypatch,name):
    prefix="ASTER_"+name.upper()
    monkeypatch.setenv(prefix+"_API_KEY","synthetic-secret")
    monkeypatch.setenv(prefix+"_MODEL","test-model")
    monkeypatch.setenv(prefix+"_BASE_URL","https://model.example/v1")
    def response(request):
        assert str(request.url)=="https://model.example/v1/chat/completions"
        assert request.headers["Authorization"]=="Bearer synthetic-secret"
        body=json.loads(request.content)
        assert body["model"]=="test-model" and body["tools"]==[{"type":"function"}]
        assert body["max_completion_tokens" if name=="openai" else "max_tokens"]==1024
        if name=="openai": assert body["store"] is False
        return httpx.Response(200,json={"choices":[{"message":{"role":"assistant","content":"answer","reasoning_content":"private-roundtrip"}}],"usage":{"total_tokens":12}})
    original=httpx.AsyncClient
    monkeypatch.setattr(providers.httpx,"AsyncClient",lambda **kw:original(transport=httpx.MockTransport(response),**kw))
    message,usage=await providers.complete(name,[{"role":"user","content":"hello"}],[{"type":"function"}])
    assert message["content"]=="answer" and usage["total_tokens"]==12
    assert message["reasoning_content"]=="private-roundtrip"


@pytest.mark.asyncio
async def test_error_body_redacted_and_insecure_url_rejected(monkeypatch):
    monkeypatch.setenv("ASTER_CUSTOM_API_KEY","synthetic-secret")
    monkeypatch.setenv("ASTER_CUSTOM_MODEL","test-model")
    monkeypatch.setenv("ASTER_CUSTOM_BASE_URL","https://model.example/v1")
    original=httpx.AsyncClient
    monkeypatch.setattr(providers.httpx,"AsyncClient",lambda **kw:original(transport=httpx.MockTransport(lambda r:httpx.Response(401,text="synthetic-secret private prompt")),**kw))
    with pytest.raises(ValueError,match="HTTP 401") as err: await providers.complete("custom",[],[])
    assert "synthetic-secret" not in str(err.value) and "private prompt" not in str(err.value)
    monkeypatch.setenv("ASTER_CUSTOM_BASE_URL","http://model.example/v1")
    with pytest.raises(ValueError,match="HTTPS"): await providers.complete("custom",[],[])
