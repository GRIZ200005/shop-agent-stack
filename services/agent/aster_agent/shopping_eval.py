"""Deterministic evaluation contracts. These never classify answer semantics."""
import hashlib
import json

EXPECT_KEYS={"products","forbidden_products","max_price","search_max_price","require_product_read","policy_titles","forbid_policy"}


def load_suite(path):
    raw=path.read_bytes()
    suite=json.loads(raw)
    assert suite["schema_version"]==1
    ids=set(); inputs=set()
    for case in suite["scenarios"]:
        assert case["id"] not in ids and case["split"] in {"dev","reserved"}
        ids.add(case["id"])
        assert 1<=len(case["turns"])<=5
        for turn in case["turns"]:
            assert 0<len(turn["input"])<=2000 and turn["input"] not in inputs
            inputs.add(turn["input"])
            assert turn["rubric"].strip() and set(turn["expect"])<=EXPECT_KEYS
            for field in ("products","forbidden_products"):
                assert all(type(i) is int and i>0 for i in turn["expect"].get(field,[]))
    # Canonical JSON survives Windows CRLF checkouts and harmless indentation.
    canonical=json.dumps(suite,ensure_ascii=False,sort_keys=True,separators=(",",":"))
    return suite,hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def score(expect, run, calls):
    events=run["events"]
    products=[p for e in events if e["kind"]=="product_sources" for p in e["data"]["products"]]
    ids={p["id"] for p in products}
    names={c["name"] for c in calls}
    checks={"completed":run["status"]=="COMPLETED",
        "no_disallowed_tool":not any(c.get("blocked") for c in calls)}
    if expect.get("products"):
        checks["expected_product_evidence"]=set(expect["products"])<=ids
    if expect.get("forbidden_products"):
        checks["no_previous_product_evidence"]=not (set(expect["forbidden_products"])&ids)
    if "max_price" in expect:
        checks["cited_prices_within_budget"]=bool(products) and all(float(p["price"])<=expect["max_price"] for p in products)
    if "search_max_price" in expect:
        checks["updated_budget_filter"]=any(c["name"]=="search_products" and c["arguments"].get("max_price")==expect["search_max_price"] for c in calls)
    if expect.get("require_product_read"):
        checks["product_read"]=bool(names&{"search_products","get_product"})
    if expect.get("policy_titles"):
        titles={s["title"] for e in events if e["kind"]=="citations" for s in e["data"]["sources"]}
        checks["expected_policy_evidence"]=set(expect["policy_titles"])<=titles
    if expect.get("forbid_policy"):
        checks["no_unrequested_policy_search"]="search_policies" not in names
    return checks


def summarize(rows, planned):
    counts={}
    for row in rows:
        for key,ok in row["checks"].items():
            entry=counts.setdefault(key,{"passed":0,"total":0})
            entry["total"]+=1;entry["passed"]+=int(ok)
    return {"planned_turns":planned,"recorded_turns":len(rows),
        "all_contracts_passed":sum(all(r["checks"].values()) for r in rows),"checks":counts,
        "reported_tokens":sum(r["reported_tokens"] for r in rows),
        "answer_accuracy":None,"unreviewed_answers":sum(r["human_review"] is None for r in rows)}
