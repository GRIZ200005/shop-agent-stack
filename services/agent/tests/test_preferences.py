import json
import socket
import httpx
import pytest
from cryptography.fernet import Fernet
from aster_agent.preferences import Preferences
from aster_agent.store import Store, StoreError
from aster_agent.outbound import validate_url, PublicTransport


@pytest.fixture
def prefs(tmp_path):
    path=tmp_path/"key"
    path.write_bytes(Fernet.generate_key())
    return Preferences(Store(str(tmp_path/"db.sqlite")),str(path))


def test_encryption_isolation_and_restart(prefs):
    result=prefs.save(1,"deepseek","model-a","https://api.deepseek.com","synthetic-key-a")
    assert result["has_key"] and "synthetic-key-a" not in str(result)
    assert "synthetic-key-a" not in str(prefs.get(1))
    assert not prefs.public_config(2,"deepseek")["has_key"]
    with prefs.store.db() as db:
        data=db.execute("SELECT ciphertext FROM provider_credentials").fetchone()[0]
        assert b"synthetic-key-a" not in data and b"model-a" not in data
        db.execute("INSERT INTO provider_credentials VALUES(?,?,?)",(2,"deepseek",data))
    with pytest.raises(StoreError): prefs.personal(2,"deepseek")
    assert prefs.personal(1,"deepseek")["key"]=="synthetic-key-a"


def test_preserve_replace_delete_and_default(prefs):
    prefs.save(1,"custom","m","https://model.example/v1","synthetic-original")
    prefs.save(1,"custom","m2","https://model.example/v1","")
    assert prefs.personal(1,"custom")["key"]=="synthetic-original"
    with pytest.raises(StoreError): prefs.save(1,"custom","m2","https://other.example/v1","")
    prefs.save(1,"custom","m2","https://other.example/v1","synthetic-replacement")
    prefs.update(1,"Name",True,"custom")
    assert prefs.get(1)["default_provider"]=="custom"
    prefs.delete(2,"custom")
    assert prefs.personal(1,"custom") is not None
    prefs.delete(1,"custom")
    assert prefs.get(1)["default_provider"]=="" and prefs.personal(1,"custom") is None


@pytest.mark.parametrize("url",["http://example.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://169.254.169.254", "https://10.0.0.1", "https://example.com:8010", "https://key@example.com", "https://example.com?key=secret"])
def test_private_or_unsafe_url_rejected(url):
    with pytest.raises(StoreError): validate_url(url)


@pytest.mark.asyncio
async def test_dns_is_pinned_and_tls_hostname_preserved(monkeypatch):
    import asyncio
    async def addresses(*args,**kwargs): return [(socket.AF_INET,socket.SOCK_STREAM,6,"",("8.8.8.8",443))]
    monkeypatch.setattr(asyncio.get_running_loop(),"getaddrinfo",addresses)
    transport=PublicTransport()
    async def wire(request):
        assert request.url.host=="8.8.8.8"
        assert request.headers["host"]=="model.example"
        assert request.extensions["sni_hostname"]=="model.example"
        return httpx.Response(200,json={})
    monkeypatch.setattr(transport.inner,"handle_async_request",wire)
    await transport.handle_async_request(httpx.Request("POST","https://model.example/v1/chat/completions"))
    async def private(*args,**kwargs): return [(socket.AF_INET,socket.SOCK_STREAM,6,"",("127.0.0.1",443))]
    monkeypatch.setattr(asyncio.get_running_loop(),"getaddrinfo",private)
    with pytest.raises(StoreError): await transport.handle_async_request(httpx.Request("POST","https://model.example/v1/chat/completions"))
    await transport.aclose()


@pytest.mark.asyncio
async def test_settings_http_auth_and_validation_never_echo_keys(prefs,monkeypatch):
    from aster_agent import app as module
    async def identity(value):
        if value not in ("Bearer one","Bearer two"):
            from aster_agent.business import BusinessError
            raise BusinessError("Login required",401)
        return {"memberId":1 if value=="Bearer one" else 2,"executionToken":"synthetic"}
    monkeypatch.setattr(module,"preferences",prefs,raising=False)
    monkeypatch.setattr(module,"identity",identity)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=module.app),base_url="http://test") as client:
        assert (await client.get("/settings")).status_code==401
        client.headers["Authorization"]="Bearer one"
        r=await client.post("/settings/providers/custom",json={"model":"m","base_url":"https://model.example/v1","api_key":"synthetic-user-key","member_id":2})
        assert r.status_code==200 and "synthetic-user-key" not in r.text
        malformed=await client.post("/settings/providers/custom",json={"model":"","api_key":"synthetic-user-key"})
        assert malformed.status_code==422 and "synthetic-user-key" not in malformed.text
        client.headers["Authorization"]="Bearer two"
        assert not (await client.get("/settings/providers/custom")).json()["has_key"]
        await client.delete("/settings/providers/custom")
        assert prefs.personal(1,"custom")["key"]=="synthetic-user-key"
        # Prove the owner-specific saved configuration is passed into the run in memory only.
        monkeypatch.setattr(module,"store",prefs.store,raising=False)
        calls=[]
        async def execute(store,run,member,execution,model_config=None):
            calls.append((member,model_config["key"]))
            store.state(run["id"],"COMPLETED")
        monkeypatch.setattr(module.runtime,"execute",execute)
        client.headers["Authorization"]="Bearer one"
        sid=(await client.post("/sessions")).json()["id"]
        from uuid import uuid4
        response=await client.post(f"/sessions/{sid}/runs",json={"message":"test","provider":"custom","request_id":str(uuid4())})
        assert response.status_code==200
        import asyncio
        await asyncio.gather(*list(module.tasks.values()))
        assert calls==[(1,"synthetic-user-key")]
        snapshot=(await client.get(f"/sessions/{sid}")).text
        assert "synthetic-user-key" not in snapshot
