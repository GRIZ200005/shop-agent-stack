"""Multi-turn real-model shopping evaluation. Validation is free; --live is paid opt-in."""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"services/agent"))
from aster_agent import runtime, providers, tools
from aster_agent.business import identity
from aster_agent.store import Store
from aster_agent.shopping_eval import load_suite,score,summarize


async def main(args):
    path=ROOT/"evaluation/shopping-dialogues-v1.json"
    suite,digest=load_suite(path)
    cases=[c for c in suite["scenarios"] if c["split"]==args.split]
    if args.cases:
        selected=set(args.cases.split(","))
        if not selected<={c["id"] for c in cases}: raise ValueError("Cases do not belong to selected split")
        cases=[c for c in cases if c["id"] in selected]
    planned=sum(len(c["turns"]) for c in cases)
    print(json.dumps({"suite_sha256":digest,"split":args.split,"scenarios":len(cases),"turns":planned,"live":args.live}),flush=True)
    if not args.live:return
    if args.saved_member is None or not 1<=args.max_requests<=64:raise ValueError("Require saved connection and bounded request budget")
    spec=importlib.util.spec_from_file_location("product_live",ROOT/"scripts/evaluate-product-agent.py")
    helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    config=helper.config_for(args.saved_member,args.provider)
    directory=ROOT/"evaluation/runs"/("shopping-"+args.split+"-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+"-"+uuid4().hex[:6])
    directory.mkdir(parents=True)
    files=[Path(__file__),ROOT/"scripts/evaluate-product-agent.py",path,ROOT/"catalog/products.tsv",*sorted((ROOT/"services/agent/aster_agent").glob("*.py"))]
    manifest={"split":args.split,"cases":[c["id"] for c in cases],"planned_turns":planned,"provider":args.provider,"model":config["model"],
        "max_requests":args.max_requests,"transport":"same runtime entrypoint; real model/MCP/Java/MySQL; isolated synthetic customer and event DB",
        "independent_blind_holdout":False,"hashes":{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    def write(name,data): (directory/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    write("manifest.json",manifest)
    print(json.dumps({"output":str(directory.relative_to(ROOT)),"model":config["model"]}),flush=True)
    original_model,original_tool=providers.complete,tools.call
    requests=0;calls=[];responses=[];rows=[]
    async def counted(*a,**kw):
        nonlocal requests
        if requests>=args.max_requests:raise ValueError("Evaluation model request budget exhausted")
        requests+=1
        result=await original_model(*a,**kw)
        responses.append({k:v for k,v in result[0].items() if k in {"role","content","tool_calls"}})
        return result
    async def observed(session,name,arguments):
        entry={"name":name,"arguments":arguments};calls.append(entry)
        if name not in {"search_products","get_product","search_policies","get_policy_source"}:
            entry["blocked"]=True
            raise ValueError("Shopping evaluation permits only product and policy reads")
        result=await original_tool(session,name,arguments)
        entry["result"]=result
        return result
    providers.complete,tools.call=counted,observed
    store=Store(str(directory/"events.sqlite"))
    try:
        # Account creation is the only business write; no orders, cart or refunds.
        bearer=await helper.customer()
        for case in cases:
            sid=None
            for index,turn in enumerate(case["turns"]):
                calls=[];responses=[];before=requests;started=time.monotonic()
                run={"status":"NOT_RUN","events":[]}
                try:
                    if requests>=args.max_requests:raise ValueError("Request budget exhausted")
                    auth=await identity(bearer);member=auth["memberId"]
                    if sid is None:sid=store.new_session(member)["id"]
                    rid,_=store.create_run(sid,member,str(uuid4()),turn["input"],args.provider)
                    await runtime.execute(store,store.run(rid,member),member,auth["executionToken"],model_config=config)
                    run=store.run(rid,member)
                except Exception as exc:
                    # No exception message, credentials or raw infrastructure responses.
                    run={"status":"NOT_RUN","events":[],"error_type":type(exc).__name__}
                row={"scenario":case["id"],"turn":index+1,"input":turn["input"],"rubric":turn["rubric"],
                    "status":run["status"],"checks":score(turn["expect"],run,calls),"model_requests":requests-before,
                    "elapsed_ms":round((time.monotonic()-started)*1000),
                    "reported_tokens":sum(e["data"].get("reported_tokens",0) for e in run["events"] if e["kind"]=="usage"),
                    "answer":"\n".join(e["data"]["text"] for e in run["events"] if e["kind"]=="assistant"),
                    "calls":calls,"model_responses":responses,"events":run["events"],"human_review":None}
                rows.append(row)
                with (directory/"results.jsonl").open("a",encoding="utf-8") as file:file.write(json.dumps(row,ensure_ascii=False)+"\n")
                print(json.dumps({k:row[k] for k in ("scenario","turn","status","checks","model_requests")}),flush=True)
    finally:
        providers.complete,tools.call=original_model,original_tool
        summary=summarize(rows,planned)|{"model_requests":requests}
        write("summary.json",summary)
        write("review-template.json",[{"scenario":r["scenario"],"turn":r["turn"],"input":r["input"],"rubric":r["rubric"],"answer":r["answer"],"verdict":None,"reviewer":None,"reason":None} for r in rows])
        print(json.dumps(summary),flush=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live",action="store_true")
    parser.add_argument("--saved-member",type=int)
    parser.add_argument("--provider",default="deepseek")
    parser.add_argument("--split",choices=["dev","reserved"],default="dev")
    parser.add_argument("--cases",default="")
    parser.add_argument("--max-requests",type=int,default=28)
    asyncio.run(main(parser.parse_args()))
