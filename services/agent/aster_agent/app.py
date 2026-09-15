import asyncio
import json
from contextlib import asynccontextmanager
from uuid import UUID
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from .business import identity, java, BusinessError
from .store import Store, StoreError
from . import providers, tools, runtime
from .preferences import Preferences
from fastapi.exceptions import RequestValidationError

tasks: dict[str, asyncio.Task] = {}
store: Store
preferences: Preferences


@asynccontextmanager
async def lifespan(app):
    global store, preferences
    store=Store()
    preferences=Preferences(store)
    yield
    for task in list(tasks.values()):
        task.cancel()
    await asyncio.gather(*tasks.values(),return_exceptions=True)


app=FastAPI(title="Aster Agent",lifespan=lifespan,docs_url=None,redoc_url=None)


@app.exception_handler(RequestValidationError)
async def invalid_input(request, exc):
    # Pydantic error details can echo input, including a submitted API key.
    return JSONResponse({"detail":"输入格式不正确，请检查字段长度和必填项"},status_code=422)


@app.exception_handler(BusinessError)
@app.exception_handler(StoreError)
async def controlled_error(request,exc):
    code=exc.code if exc.code in (400,401,403,404,409,503) else 400
    return JSONResponse({"detail":str(exc)},status_code=code)


@app.get("/health")
async def health():
    return {"status":"UP"}


@app.get("/providers")
async def provider_list(authorization: str=Header(default="")):
    auth=await identity(authorization)
    return preferences.catalog(auth["memberId"])


@app.get("/settings")
async def get_settings(authorization: str=Header(default="")):
    auth=await identity(authorization)
    return preferences.get(auth["memberId"])


class Profile(BaseModel):
    nickname: str=Field(default="",max_length=40)
    compact: bool=False
    default_provider: str=Field(default="",max_length=30)


@app.post("/settings")
async def save_settings(body: Profile,authorization: str=Header(default="")):
    auth=await identity(authorization)
    return preferences.update(auth["memberId"],body.nickname,body.compact,body.default_provider)


class ProviderConfig(BaseModel):
    model: str=Field(min_length=1,max_length=150)
    base_url: str=Field(default="",max_length=300)
    api_key: str=Field(default="",max_length=4096)


@app.get("/settings/providers/{provider}")
async def provider_config(provider: str,authorization: str=Header(default="")):
    auth=await identity(authorization)
    return preferences.public_config(auth["memberId"],provider)


@app.post("/settings/providers/{provider}")
async def save_provider(provider: str,body: ProviderConfig,authorization: str=Header(default="")):
    auth=await identity(authorization)
    return preferences.save(auth["memberId"],provider,body.model,body.base_url,body.api_key)


@app.delete("/settings/providers/{provider}")
async def remove_provider(provider: str,authorization: str=Header(default="")):
    auth=await identity(authorization)
    return preferences.delete(auth["memberId"],provider)


@app.post("/settings/providers/{provider}/test")
async def test_provider(provider: str,authorization: str=Header(default="")):
    auth=await identity(authorization)
    config=preferences.personal(auth["memberId"],provider)
    if not config:
        raise HTTPException(400,"请先保存个人模型配置")
    try:
        message,usage=await providers.complete(provider,[{"role":"user","content":"Reply with OK."}], [{"type":"function","function":{"name":"connection_check","description":"Connection test only","parameters":{"type":"object","properties":{}}}}],config=config)
        if not message.get("content") and not message.get("tool_calls"):
            raise ValueError()
        return {"ok":True,"message":"基础连接成功；工具调用能力请在对话中进一步验证"}
    except Exception:
        # Includes transport errors and any provider body; do not echo submitted credentials.
        raise HTTPException(400,"连接测试失败，请检查地址、模型、密钥及网络；配置仍已保存") from None


@app.get("/sessions")
async def sessions(authorization: str=Header(default="")):
    auth=await identity(authorization)
    return store.sessions(auth["memberId"])


@app.post("/sessions")
async def create_session(authorization: str=Header(default="")):
    auth=await identity(authorization)
    return store.new_session(auth["memberId"])


@app.get("/sessions/{sid}")
async def get_session(sid: str, authorization: str=Header(default="")):
    auth=await identity(authorization)
    return store.session(sid,auth["memberId"])


class Message(BaseModel):
    message: str=Field(min_length=1,max_length=2000)
    provider: str=Field(max_length=30)
    request_id: UUID


@app.post("/sessions/{sid}/runs")
async def create_run(sid: str,body: Message,authorization: str=Header(default="")):
    auth=await identity(authorization)
    if not body.message.strip():
        raise HTTPException(400,"消息不能为空")
    if not any(p["id"]==body.provider and p["configured"] for p in preferences.catalog(auth["memberId"])):
        raise HTTPException(503,"所选模型尚未配置")
    rid,created=store.create_run(sid,auth["memberId"],str(body.request_id),body.message.strip(),body.provider)
    if created:
        config = None if body.provider == "fixture" else preferences.resolve(auth["memberId"],body.provider)
        tasks[rid]=asyncio.create_task(runtime.execute(store,store.run(rid,auth["memberId"]),auth["memberId"],auth["executionToken"],model_config=config))
        tasks[rid].add_done_callback(lambda task:tasks.pop(rid,None))
    return store.run(rid,auth["memberId"])


@app.get("/runs/{rid}")
async def get_run(rid: str,authorization: str=Header(default="")):
    auth=await identity(authorization)
    return store.run(rid,auth["memberId"])


@app.get("/runs/{rid}/events")
async def events(rid: str,request: Request,after: int=0,authorization: str=Header(default="")):
    auth=await identity(authorization)
    store.run(rid,auth["memberId"])
    async def stream():
        cursor=max(after,0)
        for _ in range(240):
            if await request.is_disconnected():
                return
            for event in store.events(rid,cursor):
                cursor=event["id"]
                yield f"id: {cursor}\ndata: {json.dumps(event,ensure_ascii=False)}\n\n"
            if store.run(rid,auth["memberId"])["status"] not in ("RUNNING","QUEUED","CONFIRMING"):
                return
            yield ": heartbeat\n\n"
            await asyncio.sleep(.5)
    return StreamingResponse(stream(),media_type="text/event-stream",headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})


def preview_of(run):
    previews=[e["data"] for e in run["events"] if e["kind"]=="preview"]
    if not previews:
        raise HTTPException(409,"当前执行没有可确认操作")
    return previews[-1]


class Confirm(BaseModel):
    operation_id: UUID
    confirmation_token: str=Field(min_length=10,max_length=200)


async def reconcile_run(run,auth):
    preview=preview_of(run)
    op=await java("/aster/internal/agent/operations/"+preview["id"],execution=auth["executionToken"])
    if op["status"]=="SUCCEEDED":
        if not any(e["kind"]=="operation" and e["data"].get("id")==op["id"] for e in store.events(run["id"])):
            store.emit(run["id"],"operation",op)
        store.state(run["id"],"COMPLETED","业务提交已核实")
    elif op["status"] == "CANCELLED" or op.get("expired"):
        store.state(run["id"],"STOPPED","操作已取消")
    else:
        store.state(run["id"],"WAITING_CONFIRMATION","尚未确认执行成功；可重新确认，原操作标识保持不变")
    return store.run(run["id"],auth["memberId"])


@app.post("/runs/{rid}/confirm")
async def confirm(rid: str,body: Confirm,authorization: str=Header(default="")):
    auth=await identity(authorization)
    run=store.run(rid,auth["memberId"])
    preview=preview_of(run)
    if str(body.operation_id)!=preview["id"]:
        raise HTTPException(400,"确认操作与预览不匹配")
    if run["status"]=="COMPLETED":
        return run
    store.begin_confirm(rid)
    try:
        await java(f"/aster/agent/operations/{preview['id']}/confirm",bearer=authorization,body={"confirmationToken":body.confirmation_token})
        async with tools.connect(auth["executionToken"]) as session:
            result=await tools.call(session,"submit_after_sale",{"operation_id":preview["id"]})
        store.emit(rid,"operation",result["operation"])
        store.state(rid,"COMPLETED","售后申请已提交，请在售后服务查看进度")
    except Exception:
        store.state(rid,"UNCERTAIN","执行结果待核实，请点击核实结果；不要重新创建另一笔申请")
    return store.run(rid,auth["memberId"])


@app.post("/runs/{rid}/reconcile")
async def reconcile(rid: str,authorization: str=Header(default="")):
    auth=await identity(authorization)
    run=store.run(rid,auth["memberId"])
    if run["status"] != "UNCERTAIN":
        raise HTTPException(409,"仅待核实状态需要核对结果，请刷新会话")
    return await reconcile_run(run,auth)


@app.post("/runs/{rid}/stop")
async def stop(rid: str,authorization: str=Header(default="")):
    auth=await identity(authorization)
    run=store.run(rid,auth["memberId"])
    if run["status"] in ("CONFIRMING","UNCERTAIN"):
        raise HTTPException(409,"业务提交结果需要先核实，停止对话不能撤销业务")
    if run["status"] not in ("RUNNING","QUEUED","WAITING_CONFIRMATION"):
        return run
    store.begin_stop(rid)
    if rid in tasks:
        task=tasks[rid]
        task.cancel()
        await asyncio.gather(task,return_exceptions=True)
    run=store.run(rid,auth["memberId"])
    try:
        for event in run["events"]:
            if event["kind"]=="preview":
                await java(f"/aster/agent/operations/{event['data']['id']}/cancel",bearer=authorization,body={})
    except Exception:
        store.state(rid,"UNCERTAIN","取消结果待核实，请核实操作状态")
        return store.run(rid,auth["memberId"])
    store.state(rid,"STOPPED","已停止；已提交的业务不会被撤销")
    return store.run(rid,auth["memberId"])
