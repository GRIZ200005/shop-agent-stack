"""Reproducible CPU/Milvus development experiment. Never changes live policy or Agent config."""
import argparse
import csv
import hashlib
import json
import os
import platform
import random
import statistics
import subprocess
import sys
import time
import traceback
from datetime import date, datetime, timezone
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "services/agent"))
from aster_agent.knowledge import LexicalIndex, load_drafts
from aster_agent.retrieval_metrics import rrf, metrics

parser = argparse.ArgumentParser()
parser.add_argument("--config", default="evaluation/retrieval-matrix.json")
parser.add_argument("--repeats", type=int)
args = parser.parse_args()
config = json.loads((root / args.config).read_text(encoding="utf-8"))
if args.repeats is not None:
    config["repeats"] = args.repeats
if not 1 <= config["repeats"] <= 10 or not 1 <= config["candidate_k"] <= 20 or config["final_k"] != 5:
    raise ValueError("Invalid experiment budget")
run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + uuid4().hex[:8]
out = root / ".local/retrieval-runs" / run_id
out.mkdir(parents=True)
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def write(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
manifest = {"run_id": run_id, "status": "RUNNING", "split": "observed-synthetic-development",
    "config": config, "python": platform.python_version(), "platform": platform.platform(),
    "code_sha256": {p: digest(root / p) for p in ["scripts/evaluate-retrieval-matrix.py",
        "services/agent/aster_agent/knowledge.py", "services/agent/aster_agent/retrieval_metrics.py"]},
    "corpus_sha256": digest(root / config["corpus"]), "gold_sha256": digest(root / config["gold"]),
    "timing_scope": "sequential CPU component timings; sum for composed modes, not production p95",
    "answer_evaluation": "NOT_RUN", "live_policy_mutations": False}
write("manifest.json", manifest)
print(f"Run {run_id}: preparing models and isolated Milvus collection", flush=True)
client = None
collection = "aster_eval_" + uuid4().hex
try:
    import numpy as np
    import torch
    from huggingface_hub import HfApi, snapshot_download
    from pymilvus import MilvusClient
    from sentence_transformers import SentenceTransformer, CrossEncoder
    random.seed(config["seed"])
    np.random.seed(config["seed"])
    torch.manual_seed(config["seed"])
    torch.set_num_threads(4)
    manifest["packages"] = {p: version(p) for p in ["torch", "sentence-transformers", "transformers", "pymilvus", "numpy"]}
    manifest["models"] = {}
    paths = {}
    for kind in ("embedding", "reranker"):
        model_id = config[kind]
        revision = HfApi().model_info(model_id, revision=config.get("model_revisions", {}).get(kind)).sha
        manifest["models"][kind] = {"id": model_id, "revision": revision}
        write("manifest.json", manifest)
        print(f"Downloading/loading {kind}: {model_id} @ {revision}", flush=True)
        paths[kind] = snapshot_download(model_id, revision=revision,
            allow_patterns=["*.json", "*.txt", "*.safetensors", "*.model", "README.md"],
            ignore_patterns=["onnx/*", "openvino/*"])
    started = time.perf_counter()
    encoder = SentenceTransformer(paths["embedding"], device="cpu", trust_remote_code=False)
    reranker = CrossEncoder(paths["reranker"], device="cpu", trust_remote_code=False, max_length=512)
    manifest["model_load_ms"] = (time.perf_counter() - started) * 1000
    docs = load_drafts(root / config["corpus"])
    lexical = LexicalIndex(docs, at=date(2026, 9, 15), draft_preview=True)
    records = {d.metadata["clause_id"]: d for d in docs}
    texts = [d.metadata["title"] + "：" + d.page_content for d in docs]
    keys = list(records)
    started = time.perf_counter()
    vectors = encoder.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    manifest["document_embedding_ms"] = (time.perf_counter() - started) * 1000
    client = MilvusClient(uri=os.getenv("MILVUS_URI", "http://localhost:19530"))
    manifest["milvus_version"] = client.get_server_version()
    manifest["index"] = {"type": "FLAT", "metric": "COSINE", "dimension": int(vectors.shape[1]),
                         "collection": collection, "documents": len(docs), "corpus": "offline-customer-draft-preview"}
    started = time.perf_counter()
    # Small corpus exact search makes the dense baseline independent of ANN approximation.
    index_params = client.prepare_index_params()
    index_params.add_index(field_name="vector", index_type="FLAT", metric_type="COSINE")
    client.create_collection(collection_name=collection, dimension=int(vectors.shape[1]),
                             metric_type="COSINE", consistency_level="Strong", index_params=index_params)
    client.insert(collection_name=collection, data=[{"id": i, "vector": v.tolist()} for i, v in enumerate(vectors)])
    client.flush(collection_name=collection)
    client.load_collection(collection_name=collection)
    manifest["index_build_ms"] = (time.perf_counter() - started) * 1000
    write("manifest.json", manifest)
    with (root / config["gold"]).open(encoding="utf-8", newline="") as stream:
        questions = list(csv.DictReader(stream, delimiter="\t"))
    for q in questions:
        gold = set(filter(None, q["relevant_clauses"].split(",")))
        if not gold <= records.keys():
            raise ValueError("Gold references missing source")
    # Untimed warm-up, independently recorded; no precomputed query vectors in measurements.
    encoder.encode([config["query_instruction"] + "退款规则"], normalize_embeddings=True)
    reranker.predict([["退款规则", texts[0]]], show_progress_bar=False)
    client.search(collection_name=collection, data=[vectors[0].tolist()], limit=5)
    rows = []
    def timed(fn):
        start = time.perf_counter()
        result = fn()
        return result, (time.perf_counter() - start) * 1000
    with (out / "cases.jsonl").open("w", encoding="utf-8") as trace:
        for repeat in range(config["repeats"]):
            ordered = questions.copy()
            random.Random(config["seed"] + repeat).shuffle(ordered)
            for number, q in enumerate(ordered, 1):
                query = q["query"]
                bm, bm_ms = timed(lambda: lexical.search(query, config["candidate_k"]))
                bm_ids = [h["clause_id"] for h in bm]
                vector, embedding_ms = timed(lambda: encoder.encode([config["query_instruction"] + query], normalize_embeddings=True))
                dense, search_ms = timed(lambda: client.search(collection_name=collection, data=vector.tolist(), limit=config["candidate_k"]))
                dense_ids = [keys[int(h["id"])] for h in dense[0]]
                fused, fusion_ms = timed(lambda: rrf([bm_ids, dense_ids], config["rrf_constant"])[:config["candidate_k"]])
                rankings = {"bm25": bm_ids, "dense": dense_ids, "rrf": fused}
                durations = {"bm25": bm_ms, "dense": embedding_ms + search_ms,
                             "rrf": bm_ms + embedding_ms + search_ms + fusion_ms}
                raw_scores = {"bm25": [h["score"] for h in bm], "dense": [h["distance"] for h in dense[0]]}
                rerank_ms = {}
                for mode in ("bm25", "dense", "rrf"):
                    candidates = rankings[mode]
                    pairs = [[query, records[k].metadata["title"] + "：" + records[k].page_content] for k in candidates]
                    scores, elapsed = timed(lambda: reranker.predict(pairs, batch_size=16, show_progress_bar=False).tolist() if pairs else [])
                    name = mode + "_rerank"
                    rankings[name] = [k for k, score in sorted(zip(candidates, scores), key=lambda item: (-item[1], item[0]))]
                    durations[name] = durations[mode] + elapsed
                    raw_scores[name] = dict(zip(candidates, scores))
                    rerank_ms[name] = elapsed
                relevant = set(filter(None, q["relevant_clauses"].split(",")))
                for mode in config["modes"]:
                    ids = rankings[mode]
                    row = {"case_id": q["id"], "family": q["family"], "kind": q["kind"], "repeat": repeat,
                        "mode": mode, "query": query, "expected": sorted(relevant), "candidates": ids,
                        "final": ids[:5], "latency_ms": durations[mode], "raw_scores": raw_scores.get(mode),
                        "components_ms": {"bm25": bm_ms, "embedding": embedding_ms, "dense_search": search_ms,
                                          "fusion": fusion_ms, **rerank_ms},
                        "metrics": metrics(ids, relevant) if relevant else None,
                        "behavior_result": "NOT_RUN"}
                    rows.append(row)
                    trace.write(json.dumps(row, ensure_ascii=False) + "\n")
                trace.flush()
                if number % 12 == 0:
                    print(f"Repeat {repeat+1}: {number}/{len(questions)} cases", flush=True)
    summary = {}
    for mode in config["modes"]:
        selected = [r for r in rows if r["mode"] == mode]
        scored = [r for r in selected if r["metrics"] is not None]
        summary[mode] = {"scored_cases": len(scored) // config["repeats"],
            **{key: statistics.mean(r["metrics"][key] for r in scored) for key in scored[0]["metrics"]},
            "latency_p50_ms": float(np.percentile([r["latency_ms"] for r in selected], 50)),
            "latency_p95_ms": float(np.percentile([r["latency_ms"] for r in selected], 95)),
            "by_kind": {kind: statistics.mean(r["metrics"]["recall_at_5"] for r in scored if r["kind"] == kind)
                        for kind in ("answerable", "multi")}}
    write("summary.json", summary)
    with (out / "summary.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["mode", "recall_at_5", "mrr_at_5", "ndcg_at_5", "latency_p50_ms", "latency_p95_ms"])
        for mode, result in summary.items():
            writer.writerow([mode] + [result[k] for k in ["recall_at_5", "mrr_at_5", "ndcg_at_5", "latency_p50_ms", "latency_p95_ms"]])
    write("failures.json", [r for r in rows if r["repeat"] == 0 and r["metrics"] and r["metrics"]["recall_at_5"] < 1])
    manifest["status"] = "COMPLETED"
    manifest["unscored_behavior_cases"] = sum(not q["relevant_clauses"] for q in questions)
    print(json.dumps(summary, ensure_ascii=False), flush=True)
except Exception as exc:
    manifest["status"] = "FAILED"
    manifest["error_type"] = type(exc).__name__
    traceback.print_exc()
    raise
finally:
    if client is not None:
        try:
            if client.has_collection(collection_name=collection):
                client.drop_collection(collection_name=collection)
            manifest["temporary_collection_cleanup"] = "DONE"
        except Exception:
            manifest["temporary_collection_cleanup"] = "FAILED"
        client.close()
    manifest["finished_at"] = datetime.now(timezone.utc).isoformat()
    write("manifest.json", manifest)
