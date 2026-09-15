"""Offline answer-quality audit. Signals are not semantic correctness labels."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4


def key(row):
    return (row["scenario"],row["repeat"],row["arm"],row["turn"])


def signals(row):
    answer=row.get("answer_for_local_review","").strip()
    return {"empty_answer":not bool(answer),
            "evidence_check_error":"未能完成政策证据核查" in answer,
            "run_failed":row["status"] not in {"COMPLETED","WAITING_CONFIRMATION"},
            "contract_failed":not all(row["checks"].values())}


def aggregate(rows, reviews):
    by_key={key(r):r for r in rows}
    if len(by_key)!=len(rows): raise ValueError("Duplicate trace keys")
    annotated={}
    for review in reviews:
        k=key(review)
        if k not in by_key or k in annotated: raise ValueError("Unknown or duplicate review key")
        for field in ("answer_correct","task_fulfilled","appropriate_clarification"):
            if review.get(field) is not None and type(review[field]) is not bool:
                raise ValueError("Review labels must be boolean or null")
        if any(review.get(f) is not None for f in ("answer_correct","task_fulfilled","appropriate_clarification")):
            if not isinstance(review.get("reviewer"),str) or not review["reviewer"].strip() or review.get("reviewer_type")!="human":
                raise ValueError("Scored labels require declared human reviewer provenance")
        annotated[k]=review
    result={}
    for arm in ("history","task"):
        selected=[r for r in rows if r["arm"]==arm]
        metrics={}
        for field in ("answer_correct","task_fulfilled","appropriate_clarification"):
            labels=[annotated.get(key(r),{}).get(field) for r in selected]
            scored=[v for v in labels if v is not None]
            metrics[field]={"reviewed":len(scored),"eligible_turns":len(selected),
                "coverage":len(scored)/len(selected) if selected else None,
                "pass_rate_on_reviewed":sum(scored)/len(scored) if scored else None,
                "full_sample_rate":sum(scored)/len(selected) if selected and len(scored)==len(selected) else None}
        result[arm]={"turns":len(selected),"signals":{s:sum(signals(r)[s] for r in selected) for s in ("empty_answer","evidence_check_error","run_failed","contract_failed")},
                     "human_review":metrics}
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run",type=Path)
    parser.add_argument("--reviews",type=Path)
    args=parser.parse_args()
    manifest_bytes=(args.run/"manifest.json").read_bytes()
    manifest=json.loads(manifest_bytes)
    fingerprint=hashlib.sha256(manifest_bytes).hexdigest()
    if manifest["status"]!="complete": raise ValueError("Only complete runs may enter final quality audit")
    trace_bytes=(args.run/"turns.jsonl").read_bytes()
    trace_hash=hashlib.sha256(trace_bytes).hexdigest()
    rows=[json.loads(line) for line in trace_bytes.decode("utf-8").splitlines()]
    if any(sum(r["arm"]==arm for r in rows)!=manifest["expected_turns_per_arm"] for arm in ("history","task")):
        raise ValueError("Trace count does not match manifest")
    reviews=[]
    if args.reviews:
        document=json.loads(args.reviews.read_text(encoding="utf-8"))
        if document["manifest_sha256"]!=fingerprint or document["trace_sha256"]!=trace_hash:
            raise ValueError("Review belongs to a different or modified experiment")
        reviews=document["reviews"]
    summary=aggregate(rows,reviews)
    out=args.run/("quality_"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+"_"+uuid4().hex[:8])
    out.mkdir(exist_ok=False)
    template={"manifest_sha256":fingerprint,"trace_sha256":trace_hash,"reviews":[{k:r[k] for k in ("scenario","repeat","arm","turn")} |
        {"reviewer":None,"reviewer_type":None,"answer_correct":None,"task_fulfilled":None,"appropriate_clarification":None,"notes":""} for r in rows]}
    (out/"review-template.json").write_text(json.dumps(template,ensure_ascii=False,indent=2),encoding="utf-8")
    (out/"summary.json").write_text(json.dumps({"manifest_sha256":fingerprint,"trace_sha256":trace_hash,"review_sha256":hashlib.sha256(args.reviews.read_bytes()).hexdigest() if args.reviews else None,"metrics":summary},ensure_ascii=False,indent=2),encoding="utf-8")
    alerts=[{k:r[k] for k in ("scenario","repeat","arm","turn")} | {"signals":signals(r)} for r in rows if any(signals(r).values())]
    (out/"alerts.json").write_text(json.dumps(alerts,ensure_ascii=False,indent=2),encoding="utf-8")
    lines=["# 回答质量审计", "", "自动异常信号不等于语义评分。未标注项保持未知，不能当作正确。", "",
           "| 组别 | 轮数 | 核查错误提示 | 契约失败 | 回答正确性标注覆盖 | 已标注正确率 |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
    for arm,m in summary.items():
        review=m["human_review"]["answer_correct"]
        rate="未测" if review["pass_rate_on_reviewed"] is None else f"{review['pass_rate_on_reviewed']:.2%}"
        lines.append(f"| {arm} | {m['turns']} | {m['signals']['evidence_check_error']} | {m['signals']['contract_failed']} | {review['reviewed']}/{m['turns']} | {rate} |")
    lines += ["", "核查错误通过受控提示文本识别，不涵盖所有失败。人工标注身份为文件声明，脚本不会认证评审人身份。", "review-template.json 与原始 manifest/trace 哈希绑定。填写后使用 --reviews 再生成独立审计，不改原始实验。"]
    (out/"report.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print(out)


if __name__=="__main__": main()
