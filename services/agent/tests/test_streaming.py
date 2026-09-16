import json
import httpx
import pytest
from shop_agent_stack import providers, runtime
from test_runtime import setup_runtime


def chunk(delta, finish=None):
    return 'data: ' + json.dumps({'choices': [{'index': 0, 'delta': delta, 'finish_reason': finish}]}, ensure_ascii=False) + '\r\n\r\n'


@pytest.mark.asyncio
@pytest.mark.parametrize('provider', ['deepseek', 'openai', 'kimi', 'custom'])
async def test_real_stream_wire_and_incremental_delivery(monkeypatch, provider):
    received = []
    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            raw = chunk({'content': '订单**已关闭**。', 'reasoning_content': 'private-thought'}).encode()
            # Deliberately split a multibyte character across network packets.
            for byte in raw:
                yield bytes([byte])
            assert received == ['订单**已关闭**。']
            yield chunk({'tool_calls': [{'index': 0, 'id': 'call_x', 'function': {'name': 'get_my_order', 'arguments': '{"order_'}}]}).encode()
            yield chunk({'tool_calls': [{'index': 0, 'function': {'arguments': 'id":10}'}}]}, 'tool_calls').encode()
            yield b'data: {"choices": [], "usage": {"total_tokens": 27}}\n\ndata: [DONE]\n\n'
    def respond(request):
        body = json.loads(request.content)
        assert body['stream'] and body['stream_options']['include_usage']
        assert request.headers['Authorization'] == 'Bearer synthetic-key'
        return httpx.Response(200, stream=Stream())
    original = httpx.AsyncClient
    monkeypatch.setattr(providers.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(respond), **kw))
    async def delta(text): received.append(text)
    message, usage = await providers.complete(provider, [], [], config={'model':'synthetic', 'key':'synthetic-key', 'url':'https://model.example/v1'}, on_delta=delta)
    assert usage['total_tokens'] == 27
    assert message['tool_calls'][0]['function'] == {'name':'get_my_order', 'arguments':'{"order_id":10}'}
    assert message['reasoning_content'] == 'private-thought'
    assert 'private-thought' not in str(received)


@pytest.mark.asyncio
@pytest.mark.parametrize('ending', ['', chunk({}, 'length') + 'data: [DONE]\n\n'])
async def test_incomplete_stream_is_not_success(ending):
    received = []
    async def delta(text): received.append(text)
    response = httpx.Response(200, content=(chunk({'content':'部分回答'}) + ending).encode())
    with pytest.raises(ValueError, match='未完整结束'):
        await providers.read_stream(response, delta)
    assert received == ['部分回答']


@pytest.mark.asyncio
async def test_runtime_persists_deltas_and_single_final_without_reasoning(tmp_path, monkeypatch):
    store, rid = setup_runtime(tmp_path, monkeypatch)
    async def model(*args, on_delta, **kwargs):
        await on_delta('答案' * 50)
        # A delta is visible before the provider call returns.
        assert any(e['kind'] == 'assistant_delta' for e in store.run(rid, 1)['events'])
        await on_delta('结束')
        return {'role':'assistant', 'content':'答案' * 50 + '结束', 'reasoning_content':'private-thought'}, {}
    monkeypatch.setattr(providers, 'complete', model)
    await runtime.execute(store, store.run(rid, 1), 1, 'synthetic-grant')
    run = store.run(rid, 1)
    assert run['status'] == 'COMPLETED'
    finals = [e for e in run['events'] if e['kind'] == 'assistant']
    deltas = [e for e in run['events'] if e['kind'] == 'assistant_delta']
    assert len(finals) == 1
    assert ''.join(e['data']['text'] for e in deltas) == finals[0]['data']['text']
    assert all(e['data']['message_id'] == finals[0]['data']['message_id'] for e in deltas)
    assert 'private-thought' not in str(run)
