"""Bounded closed-loop local read baseline. No business writes or model requests."""
import argparse
import asyncio
from datetime import datetime,timezone
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import time
from uuid import uuid4
import httpx

ROOT=Path(__file__).resolve().parents[1]


def percentile(values,p):
    return sorted(values)[max(0,math.ceil(len(values)*p)-1)] if values else None


def valid(response,endpoint):
    try:
        body=response.json()
        if response.status_code!=200 or body.get("code")!=200: return False
        data=body["data"]
        return isinstance(data.get("list"),list) if endpoint=="catalog" else data.get("scope")=="P4_ASYNC_SIMULATOR" and isinstance(data.get("rows"),list) and isinstance(data.get("summary"),dict)
    except (ValueError,KeyError,TypeError,AttributeError): return False


def metrics(samples,seconds):
    latencies=[r["ms"] for r in samples]
    successes=sum(r["ok"] for r in samples)
    return {"requests":len(samples),"successes":successes,"errors":len(samples)-successes,
            "error_rate":(len(samples)-successes)/len(samples) if samples else None,
            "duration_seconds":seconds,"completed_rps":len(samples)/seconds if seconds>0 else None,
            "successful_rps":successes/seconds if seconds>0 else None,
            "p50_ms":percentile(latencies,.5),"p95_ms":percentile(latencies,.95),"p99_ms":percentile(latencies,.99)}


async def run(args,out):
    accounts=json.loads((ROOT/".local/p1-accounts.json").read_text(encoding="utf-8-sig"))
    account=next(a for a in accounts if a["role"]=="SERVICE")
    async with httpx.AsyncClient(base_url="http://web",timeout=10,trust_env=False,
            limits=httpx.Limits(max_connections=15,max_keepalive_connections=15)) as client:
        login=await client.post("/api/admin/admin/login",json={k:account[k] for k in ("username","password")})
        body=login.json()
        if body.get("code")!=200: raise ValueError("Benchmark login failed")
        token=body["data"]["tokenHead"]+body["data"]["token"]
        endpoints={"catalog":("/api/portal/product/search?pageNum=1&pageSize=20&sort=0",{}),
                   "refund_monitor":("/api/admin/aster/refunds/monitor",{"Authorization":token})}
        results=[]
        for repeat in range(args.repeats):
            for name in (list(endpoints) if repeat%2==0 else list(reversed(endpoints))):
                path,headers=endpoints[name]
                for _ in range(5):
                    if not valid(await client.get(path,headers=headers),name): raise ValueError("Warmup contract failed")
                for concurrency in (1,5,15):
                    samples=[]
                    async def worker(worker_id):
                        for number in range(args.requests_per_worker):
                            started=time.perf_counter()
                            try:
                                response=await client.get(path,headers=headers)
                                ok=valid(response,name); outcome="ok" if ok else "http_or_business_error"
                            except httpx.HTTPError:
                                ok=False; outcome="transport_error"
                            samples.append({"worker":worker_id,"request":number,"ms":(time.perf_counter()-started)*1000,"ok":ok,"outcome":outcome})
                    started=time.perf_counter()
                    await asyncio.gather(*(worker(i) for i in range(concurrency)))
                    elapsed=time.perf_counter()-started
                    result={"endpoint":name,"repeat":repeat,"concurrency":concurrency,**metrics(samples,elapsed)}
                    results.append(result)
                    with (out/"stages.jsonl").open("a",encoding="utf-8") as f: f.write(json.dumps(result)+"\n")
                    with (out/"requests.jsonl").open("a",encoding="utf-8") as f:
                        for sample in samples: f.write(json.dumps({"endpoint":name,"repeat":repeat,"concurrency":concurrency,**sample})+"\n")
                    print(json.dumps(result),flush=True)
                    # Stop escalating a failing service rather than retrying indefinitely.
                    if result["error_rate"]>.05: raise ValueError("Error-rate stop threshold exceeded")
                    await asyncio.sleep(.5)
        return results


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats",type=int,default=3)
    parser.add_argument("--requests-per-worker",type=int,default=30)
    parser.add_argument("--revision",required=True)
    args=parser.parse_args()
    if not 1<=args.repeats<=3 or not 10<=args.requests_per_worker<=100: parser.error("Budget outside local safety limits")
    out=ROOT/"evaluation/runs/performance"/(datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+"_"+uuid4().hex[:8]);out.mkdir(parents=True,exist_ok=False)
    manifest={"revision":args.revision,"script_sha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "python":platform.python_version(),"httpx":importlib.metadata.version("httpx"),
              "repeats":args.repeats,"requests_per_worker":args.requests_per_worker,"concurrency":[1,5,15],
              "environment":"shared local Docker; nginx to Java services; existing development data",
              "workload":"closed loop, no think time; five warmup requests per endpoint per repeat; no writes or LLM calls",
              "status":"running","production_capacity_claim":False}
    try:
        results=asyncio.run(run(args,out));manifest["status"]="complete"
    except Exception:
        manifest["status"]="incomplete";results=[]
        print("Benchmark incomplete; partial records retained. No response bodies or credentials printed.")
    (out/"manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    lines=["# 本机只读并发基线","","闭环压测、共享开发资源、现有小数据量；不代表线上容量。P95 包含失败请求，RPS 是完成请求数/阶段总耗时。","",
           "| 接口 | 轮次 | 并发 | 请求数 | 错误率 | 完成 RPS | P50 ms | P95 ms |","| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for r in results: lines.append(f"| {r['endpoint']} | {r['repeat']+1} | {r['concurrency']} | {r['requests']} | {r['error_rate']:.2%} | {r['completed_rps']:.1f} | {r['p50_ms']:.2f} | {r['p95_ms']:.2f} |")
    lines += ["",f"状态：{manifest['status']}。固定请求量的短测存在预热、顺序和闭环负载限制，不能推导峰值 QPS。"]
    (out/"report.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print(out)
    return 0 if manifest["status"]=="complete" else 1


if __name__=="__main__": raise SystemExit(main())
