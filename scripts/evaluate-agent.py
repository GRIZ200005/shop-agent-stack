"""Isolated Agent-loop evaluation; synthetic tools, explicit opt-in paid models."""
import argparse
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import statistics
import sqlite3
import sys
import time
from types import SimpleNamespace
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/agent"))
from shop_agent_stack import runtime, providers, tools
from shop_agent_stack.store import Store


def model_config(args):
    if not args.live:
        return None
    if args.saved_member is None:
        return providers.settings(args.provider)
    # Never construct Store on the live DB: its startup recovery changes running sessions.
    from cryptography.fernet import Fernet
    with sqlite3.connect("file:/data/agent.sqlite?mode=ro",uri=True) as db:
        row=db.execute("SELECT ciphertext FROM provider_credentials WHERE member_id=? AND provider=?",(args.saved_member,args.provider)).fetchone()
    if row is None: raise ValueError("Selected saved connection is unavailable")
    config=json.loads(Fernet(Path("/run/secrets/agent_key").read_bytes().strip()).decrypt(row[0]))
    if config.pop("member")!=args.saved_member or config["id"]!=args.provider:
        raise ValueError("Saved connection ownership mismatch")
    return config


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(cases):
    ids=set()
    for case in cases:
        if case["id"] in ids or case["split"] != "dev" or not case["turns"]:
            raise ValueError("Invalid or duplicate development scenario")
        ids.add(case["id"])
        for turn in case["turns"]:
            if not 0 < len(turn["input"]) <= 2000:
                raise ValueError("Invalid input length")
            if not set(turn["expect"]) <= {"required_order", "forbid_preview", "require_preview"}:
                raise ValueError("Unknown automatic assertion")
    if not cases:
        raise ValueError("Empty scenario set")


def score(expect, calls, status):
    checks={"run_finished":status in {"COMPLETED","WAITING_CONFIRMATION"}}
    orders=[c["order_id"] for c in calls if c["name"]=="get_my_order"]
    if "required_order" in expect:
        # All detail reads must target the labelled order, not just one lucky call.
        checks["order_selection"] = bool(orders) and all(x==expect["required_order"] for x in orders)
    previews=[c for c in calls if c["name"]=="preview_after_sale"]
    if expect.get("forbid_preview"):
        checks["no_unrequested_preview"] = not previews
    if expect.get("require_preview"):
        checks["preview_waits_for_confirmation"] = bool(previews) and status=="WAITING_CONFIRMATION"
    return checks


def summarize(rows):
    result={}
    for arm in ("history", "task"):
        selected=[r for r in rows if r["arm"]==arm]
        counts={}
        for row in selected:
            for key,value in row["checks"].items():
                n=counts.setdefault(key,{"passed":0,"total":0})
                n["total"]+=1; n["passed"]+=int(value)
        scenario_groups={}
        for row in selected:
            scenario_groups.setdefault((row["scenario"],row["repeat"]),[]).append(row)
        elapsed=sorted(r["elapsed_ms"] for r in selected)
        result[arm]={"turns":len(selected),"checks":counts,
            "scenario_contract_passed":sum(len(v)==v[0]["expected_turns"] and all(all(r["checks"].values()) for r in v) for v in scenario_groups.values()),
            "scenario_runs":len(scenario_groups),
            "latency_p50_ms":statistics.median(elapsed) if elapsed else None,
            "latency_p95_ms":elapsed[max(0, int(len(elapsed)*.95+.999)-1)] if elapsed else None,
            "reported_tokens":sum(r["reported_tokens"] or 0 for r in selected),
            "turns_without_token_usage":sum(r["reported_tokens"] is None for r in selected),
            "answer_correctness":None}
    return result


def definition(name):
    properties={}
    required=[]
    if name in {"get_my_order","preview_after_sale"}:
        properties["order_id"]={"type":"integer"}; required.append("order_id")
    if name=="preview_after_sale":
        properties["reason"]={"type":"string"}; required.append("reason")
    if name=="search_policies":
        properties["query"]={"type":"string"}; required.append("query")
    if name=="get_operation_status":
        properties["operation_id"]={"type":"string"}; required.append("operation_id")
    return SimpleNamespace(name=name,description="Synthetic evaluation tool: "+name,
        inputSchema={"type":"object","properties":properties,"required":required,"additionalProperties":False})


async def scripted_model(provider,messages,definitions,**kwargs):
    """Harness smoke only: deterministic simple order lookup, no answer labels accessed."""
    if messages[-1]["role"]=="tool":
        return {"role":"assistant","content":"模拟工具查询已结束，请查看订单。"},{}
    user=messages[-1]["content"]
    # Deliberately simple baseline: this is not a real model or measured reasoning quality.
    current=re.findall(r"订单\s*(101|202)",user)
    if not current and "那一单" in user:
        current=re.findall(r"订单\s*(101|202)"," ".join(m["content"] for m in messages if m["role"]=="user"))
    if current:
        return {"role":"assistant","tool_calls":[{"id":"smoke", "function":{"name":"get_my_order","arguments":json.dumps({"order_id":int(current[-1])})}}]},{}
    return {"role":"assistant","content":"请补充需要查询的订单。"},{}


async def evaluate(args, cases, out):
    original_complete,original_connect,original_call=providers.complete,tools.connect,tools.call
    model_calls=0
    call_log=[]
    config=model_config(args)
    if args.live:
        if not all(config[k] for k in ("key","model","url")):
            raise ValueError("Missing dedicated evaluation provider configuration")
        config["personal"]=True  # Reuse public-only outbound validation.
    async def counted(*a,**kw):
        nonlocal model_calls
        if model_calls>=args.max_model_calls:
            raise ValueError("Evaluation model-call budget exhausted")
        model_calls+=1
        return await (original_complete(*a,**kw) if args.live else scripted_model(*a,**kw))
    class Session:
        async def list_tools(self):
            return SimpleNamespace(tools=[definition(n) for n in sorted(tools.MODEL_TOOLS)])
    @asynccontextmanager
    async def connect(execution):
        yield Session()
    async def invoke(session,name,params):
        # Only narrow metadata is recorded; model-generated arbitrary arguments are not logged.
        order_id=params.get("order_id")
        call_log.append({"name":name,"order_id":order_id if type(order_id) is int else None})
        orders={101:{"id":101,"status":3,"totalAmount":199,"product":"耳机"},202:{"id":202,"status":1,"totalAmount":49,"product":"数据线"}}
        if name=="list_my_orders": return {"orders":list(orders.values())}
        if name in {"get_my_order","preview_after_sale"}:
            if type(order_id) is not int or order_id not in orders: raise ValueError("订单不存在或无权访问")
            if name=="get_my_order": return {"order":orders[order_id]}
            return {"preview":{"id":"synthetic-preview","orderId":order_id}}
        if name=="list_my_after_sales": return {"after_sales":[]}
        if name=="search_policies": return {"evidence":[],"retrieval":{"method":"SYNTHETIC_EMPTY"}}
        raise ValueError("评测环境不支持该操作")
    providers.complete,tools.connect,tools.call=counted,connect,invoke
    rows=[]
    try:
        store=Store(str(out/"sessions.sqlite"))
        for repeat in range(args.repeats):
            for case in cases:
                # Alternate order to reduce systematic warm-up bias; state remains isolated.
                for arm in (("history","task") if repeat%2==0 else ("task","history")):
                    sid=store.new_session(1)["id"]
                    for index,turn in enumerate(case["turns"]):
                        if model_calls>=args.max_model_calls:
                            raise ValueError("Evaluation model-call budget exhausted; partial results retained")
                        call_log.clear()
                        rid,_=store.create_run(sid,1,str(uuid4()),turn["input"],args.provider if args.live else "fixture")
                        started=time.perf_counter()
                        await runtime.execute(store,store.run(rid,1),1,"synthetic-evaluation-only",model_config=config,memory_enabled=arm=="task")
                        run=store.run(rid,1)
                        usage=[e["data"]["reported_tokens"] for e in run["events"] if e["kind"]=="usage"]
                        answer="\n".join(e["data"]["text"] for e in run["events"] if e["kind"]=="assistant")
                        if config: answer=answer.replace(config["key"],"[REDACTED]")
                        row={"scenario":case["id"],"family":case["family"],"repeat":repeat,"arm":arm,"turn":index+1,"expected_turns":len(case["turns"]),
                             "status":run["status"],"checks":score(turn["expect"],call_log,run["status"]),
                             "elapsed_ms":round((time.perf_counter()-started)*1000,2),"reported_tokens":sum(usage) if any(usage) else None,
                             "calls":list(call_log),"answer_for_local_review":answer,"review_status":"pending"}
                        rows.append(row)
                        with (out/"turns.jsonl").open("a",encoding="utf-8") as f: f.write(json.dumps(row,ensure_ascii=False)+"\n")
    finally:
        providers.complete,tools.connect,tools.call=original_complete,original_connect,original_call
    return rows,model_calls


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live",action="store_true",help="Explicitly authorize paid model requests to configured provider")
    parser.add_argument("--saved-member",type=int,help="Use the selected owner's encrypted connection from a read-only volume")
    parser.add_argument("--provider",choices=["deepseek","openai","kimi","custom"],default="deepseek")
    parser.add_argument("--repeats",type=int,default=1)
    parser.add_argument("--max-model-calls",type=int,default=100)
    parser.add_argument("--fail-on-contract",action="store_true",help="Exit 2 if any automatic contract fails (for CI)")
    parser.add_argument("--cases",type=Path,default=ROOT/"evaluation/agent-multiturn-v1.json")
    parser.add_argument("--output-root",type=Path,default=ROOT/"evaluation/runs/agent")
    args=parser.parse_args()
    if not 1<=args.repeats<=10 or not 1<=args.max_model_calls<=1000: parser.error("Invalid budget")
    cases=json.loads(args.cases.read_text(encoding="utf-8")); validate(cases)
    out=args.output_root/(datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+"_"+uuid4().hex[:8]); out.mkdir(parents=True,exist_ok=False)
    sources=sorted((ROOT/"services/agent/shop_agent_stack").glob("*.py"))+[Path(__file__),ROOT/"services/agent/requirements.lock"]
    manifest={"schema_version":1,"mode":"live_model_synthetic_tools" if args.live else "scripted_harness_smoke",
              "dataset_sha256":digest(args.cases),"source_sha256":{str(p.relative_to(ROOT)):digest(p) for p in sources},
              "provider":args.provider if args.live else "scripted","model":model_config(args)["model"] if args.live else "scripted-v1",
              "sampling":"provider defaults; output limit inherited from gateway","repeats":args.repeats,"max_model_calls":args.max_model_calls,
              "python_version":sys.version.split()[0],"scenarios":len(cases),"expected_turns_per_arm":sum(len(c["turns"]) for c in cases)*args.repeats,
              "split":"development; not independent holdout","business_environment":"isolated synthetic tools; no Java/MySQL/Milvus traffic",
              "answer_accuracy_measured":False,"status":"running"}
    (out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    try:
        rows,calls=asyncio.run(evaluate(args,cases,out))
        manifest.update(status="complete",model_calls=calls)
    except Exception:
        manifest["status"]="incomplete"
        print("Evaluation incomplete; inspect local artifacts. No raw provider error was printed.",file=sys.stderr)
    rows=[json.loads(line) for line in (out/"turns.jsonl").read_text(encoding="utf-8").splitlines()] if (out/"turns.jsonl").exists() else []
    summary=summarize(rows)
    (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    with (out/"review.jsonl").open("w",encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps({k:row[k] for k in ("scenario","repeat","arm","turn")} | {"reviewer":None,"answer_correct":None,"appropriate_clarification":None,"notes":""},ensure_ascii=False)+"\n")
    (out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    report=["# Agent 多轮评测", "",f"模式：{manifest['mode']}；状态：{manifest['status']}。", "",
            "合成业务工具、开发场景。下表为机器可检查的契约结果，不是回答准确率或生产任务完成率。", "",
            "| 对照组 | 场景契约通过/总数 | 轮数 | P95 ms | 无用量轮数 |", "| --- | --- | --- | --- | --- |"]
    for arm,s in summary.items(): report.append(f"| {arm} | {s['scenario_contract_passed']}/{s['scenario_runs']} | {s['turns']} | {s['latency_p95_ms']} | {s['turns_without_token_usage']} |")
    report += ["", "回答正确性：未评分。请人工复核 turns.jsonl 的回答，不能由被测模型给自己打分。", "脚本引擎结果仅验证评测管线，不能用作模型效果提升数据。"]
    (out/"report.md").write_text("\n".join(report)+"\n",encoding="utf-8")
    print(out)
    if manifest["status"]!="complete": return 1
    if args.fail_on_contract and any(not all(r["checks"].values()) for r in rows): return 2
    return 0


if __name__=="__main__": sys.exit(main())
