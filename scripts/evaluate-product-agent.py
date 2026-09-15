"""Opt-in paid development smoke: actual LangGraph -> MCP -> Java -> MySQL.

Uses an isolated event store and synthetic customer. The saved model connection
is decrypted only in memory through a read-only SQLite connection; never copied
to test users. WAL coordination files require a writable directory mount.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import time
from uuid import uuid4
import httpx
from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/agent"))
from aster_agent import runtime, providers, tools
from aster_agent.business import identity, PORTAL
from aster_agent.store import Store


def connections():
    with sqlite3.connect("file:/data/agent.sqlite?mode=ro",uri=True) as db:
        return db.execute("SELECT member_id,provider FROM provider_credentials").fetchall()


def config_for(member, provider):
    with sqlite3.connect("file:/data/agent.sqlite?mode=ro",uri=True) as db:
        row=db.execute("SELECT ciphertext FROM provider_credentials WHERE member_id=? AND provider=?",(member,provider)).fetchone()
    if row is None: raise ValueError("Saved connection unavailable")
    config=json.loads(Fernet(Path("/run/secrets/agent_key").read_bytes().strip()).decrypt(row[0]))
    if config.pop("member") != member or config["id"] != provider:
        raise ValueError("Connection ownership mismatch")
    return config


async def customer():
    phone="000"+str(int(uuid4().hex[:7],16)).zfill(8)[-8:]
    async with httpx.AsyncClient(base_url=PORTAL,timeout=20,trust_env=False) as client:
        otp=(await client.get("/sso/getAuthCode",params={"telephone":phone})).json()["data"]
        data={"username":"product_eval_"+uuid4().hex[:10],"password":uuid4().hex+"Aa9!","telephone":phone,"authCode":otp}
        if (await client.post("/sso/register",data=data)).json()["code"] != 200:
            raise ValueError("Synthetic account registration failed")
        login=(await client.post("/sso/login",data={k:data[k] for k in ("username","password")})).json()["data"]
        return login["tokenHead"]+login["token"]


async def main(args):
    if args.list_connections:
        print(json.dumps(connections()))
        return
    if not args.live or args.saved_member is None:
        raise ValueError("Require --live and --saved-member; paid calls need explicit user authorization")
    config=config_for(args.saved_member,args.provider)
    selected=[int(i) for i in args.indices.split(",")]
    cases=json.loads((ROOT/"catalog/search-cases.json").read_text())["futureAgentScenarios"]
    if not selected or len(selected)>8 or len(set(selected))!=len(selected) or any(i<0 or i>=len(cases) for i in selected):
        raise ValueError("Select 1-8 unique valid development cases")
    directory=ROOT/"evaluation/runs"/("product-live-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+"-"+uuid4().hex[:6])
    directory.mkdir(parents=True)
    manifest={"kind":"development smoke, not independent holdout", "provider":args.provider,"model":config["model"],"indices":selected,
        "transport":"runtime entrypoint + real MCP + real Java + real MySQL; HTTP Agent route not exercised",
        "max_model_requests":32,"hashes":{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),ROOT/"catalog/search-cases.json",ROOT/"catalog/products.tsv",*sorted((ROOT/"services/agent/aster_agent").glob("*.py"))]}}
    (directory/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({"output":str(directory.relative_to(ROOT)),"provider":args.provider,"model":config["model"]}),flush=True)
    bearer=await customer()
    store=Store(str(directory/"events.sqlite"))
    original_model=providers.complete
    original_call=tools.call
    requests=0
    calls=[]
    responses=[]
    async def counted(*a,**kw):
        nonlocal requests
        if requests>=32: raise ValueError("Evaluation request budget exhausted")
        requests+=1
        result=await original_model(*a,**kw)
        responses.append({k:v for k,v in result[0].items() if k in {"role","content","tool_calls"}})
        return result
    async def observed(session,name,arguments):
        entry={"name":name,"arguments":arguments}
        calls.append(entry)
        if name not in {"search_products","get_product","search_policies","get_policy_source"}:
            entry["blocked"]=True
            raise ValueError("Shopping evaluation permits read-only product/policy tools only")
        result=await original_call(session,name,arguments)
        entry["result"]=result
        return result
    providers.complete=counted
    tools.call=observed
    rows=[]
    try:
        for index in selected:
            case=cases[index]
            auth=await identity(bearer)
            member=auth["memberId"]
            sid=store.new_session(member)["id"]
            rid,_=store.create_run(sid,member,str(uuid4()),case["question"],args.provider)
            calls=[]
            responses=[]
            before=requests
            started=time.monotonic()
            await runtime.execute(store,store.run(rid,member),member,auth["executionToken"],model_config=config)
            run=store.run(rid,member)
            events=run["events"]
            sources=[p for e in events if e["kind"]=="product_sources" for p in e["data"]["products"]]
            checks={"completed":run["status"]=="COMPLETED", "expected_evidence":set(case["evidenceIds"])<={p["id"] for p in sources},
                "no_disallowed_tool":not any(c.get("blocked") for c in calls)}
            row={"index":index,"question":case["question"],"expected":case["expected"],"checks":checks,"status":run["status"],
                "elapsed_ms":round((time.monotonic()-started)*1000),"model_requests":requests-before,
                "reported_tokens":sum(e["data"].get("reported_tokens",0) for e in events if e["kind"]=="usage"),
                "answer":"\n".join(e["data"]["text"] for e in events if e["kind"]=="assistant"),"calls":calls,"events":events,"model_responses":responses,"manual_answer_review":None}
            rows.append(row)
            with (directory/"results.jsonl").open("a") as f: f.write(json.dumps(row,ensure_ascii=False)+"\n")
            print(json.dumps({k:row[k] for k in ("index","checks","status","elapsed_ms","model_requests","reported_tokens")}),flush=True)
    finally:
        providers.complete=original_model
        tools.call=original_call
        summary={"planned":len(selected),"recorded":len(rows),"contract_passed":sum(all(r["checks"].values()) for r in rows),"model_requests":requests,
            "reported_tokens":sum(r["reported_tokens"] for r in rows),"answer_accuracy":None}
        (directory/"summary.json").write_text(json.dumps(summary,indent=2))
        print(json.dumps(summary),flush=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-connections",action="store_true")
    parser.add_argument("--live",action="store_true")
    parser.add_argument("--saved-member",type=int)
    parser.add_argument("--provider",default="deepseek")
    parser.add_argument("--indices",default="0,1,4,9,10,11,14,19")
    asyncio.run(main(parser.parse_args()))
