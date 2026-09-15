"""Single-worker local policy index service; transactional outbox is authoritative in Java."""
import hashlib
import hmac
import json
import os
import sys
import threading
import time
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
import torch
from huggingface_hub import snapshot_download
from pymilvus import MilvusClient
from sentence_transformers import SentenceTransformer, CrossEncoder
from langchain_core.documents import Document

sys.path.insert(0, "/workspace/services/agent")
from aster_agent.knowledge import LexicalIndex
from aster_agent.retrieval_metrics import rrf
from aster_agent.policy_snapshot import snapshot_digest

KEY = Path("/run/secrets/index_key").read_text().strip()
PORTAL = "http://portal:8085/aster/internal/agent/index"
CONFIG = json.loads(Path("/workspace/evaluation/retrieval-matrix.json").read_text())
LOCK = threading.Lock()
ACTIVE = None
STATUS = {"ready": False, "state": "LOADING", "attempts": 0}
client = None
encoder = None
reranker = None


def java(path, body=None):
    with httpx.Client(timeout=15, trust_env=False) as http:
        response = http.request("GET" if body is None else "POST", PORTAL + path,
                                headers={"X-Aster-Index": KEY}, json=body)
        response.raise_for_status()
        result = response.json()
        if result["code"] != 200:
            raise RuntimeError("INDEX_API_FAILED")
        return result.get("data")


def snapshot():
    after = 0
    rows = []
    epoch = None
    for _ in range(100):
        page = java(f"/catalog?after={after}")
        if epoch is not None and page["epoch"] != epoch:
            raise RuntimeError("SNAPSHOT_CHANGED")
        epoch = page["epoch"]
        rows.extend(page["items"])
        if not page["more"]:
            break
        after = page["next"]
    else:
        raise RuntimeError("INDEX_BUDGET_EXCEEDED")
    if java("/state")["epoch"] != epoch:
        raise RuntimeError("SNAPSHOT_CHANGED")
    return epoch, rows


def documents(rows):
    return [Document(page_content=r["content"], metadata={
        "clause_id": f"P{r['policy_id']}V{r['version']}C{r['clause_no']}",
        "doc_id": str(r["family_id"]), "title": r["title"], "version": r["version"],
        "visibility": "CUSTOMER", "status": "PUBLISHED", "effective_from": "0001-01-01"}) for r in rows]


def worker():
    global ACTIVE, client, encoder, reranker
    failures = 0
    while True:
        epoch = None
        collection = "aster_live_pending"
        try:
            if encoder is None or reranker is None:
                torch.set_num_threads(4)
                paths = {kind: snapshot_download(CONFIG[kind], revision=CONFIG["model_revisions"][kind], local_files_only=True)
                         for kind in ("embedding", "reranker")}
                encoder = SentenceTransformer(paths["embedding"], device="cpu", trust_remote_code=False)
                reranker = CrossEncoder(paths["reranker"], device="cpu", trust_remote_code=False, max_length=512)
            if client is None:
                client = MilvusClient(uri="http://milvus:19530", timeout=5)
            epoch, rows = snapshot()
            digest = snapshot_digest(rows)
            model_hash = hashlib.sha256(json.dumps(CONFIG, sort_keys=True).encode()).hexdigest()[:12]
            collection = f"aster_live_{model_hash}_{epoch}_{digest[:16]}"
            with LOCK:
                if ACTIVE is None or ACTIVE["collection"] != collection:
                    STATUS.update(state="BUILDING", ready=False)
                    docs = documents(rows)
                    texts = [r["title"] + "：" + r["content"] for r in rows]
                    if not client.has_collection(collection_name=collection):
                        params = client.prepare_index_params()
                        params.add_index(field_name="vector", index_type="FLAT", metric_type="COSINE")
                        client.create_collection(collection_name=collection, dimension=encoder.get_sentence_embedding_dimension(),
                                                 metric_type="COSINE", consistency_level="Strong", index_params=params)
                    # Stable primary keys make partial-build retry idempotent.
                    if int(client.get_collection_stats(collection_name=collection)["row_count"]) != len(rows):
                        if texts:
                            vectors = encoder.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
                            client.upsert(collection_name=collection, data=[{"id": i, "vector": v.tolist()} for i, v in enumerate(vectors)])
                        client.flush(collection_name=collection)
                    client.load_collection(collection_name=collection)
                    if int(client.get_collection_stats(collection_name=collection)["row_count"]) != len(rows):
                        raise RuntimeError("INDEX_COUNT_MISMATCH")
                    if java("/state")["epoch"] != epoch:
                        raise RuntimeError("SNAPSHOT_CHANGED")
                    java("/result", {"revision": epoch, "success": True, "collection": collection})
                    ACTIVE = {"epoch": epoch, "digest": digest, "collection": collection, "rows": rows,
                              "documents": docs, "lexical": LexicalIndex(docs, at=date.today())}
                    # This dedicated service owns only aster_live_* collections.
                    for old in client.list_collections():
                        if old.startswith("aster_live_") and old != collection:
                            client.drop_collection(collection_name=old)
                else:
                    client.get_collection_stats(collection_name=collection, timeout=3)
                    if STATUS["state"] != "READY":
                        java("/result", {"revision": epoch, "success": True, "collection": collection})
                STATUS.update(ready=True, state="READY", epoch=epoch, digest=digest,
                              collection=collection, clauses=len(rows), model_revisions=CONFIG["model_revisions"])
                STATUS.pop("error", None)
            failures = 0
            time.sleep(2)
        except Exception as exc:
            print("Index retry:", type(exc).__name__, flush=True)
            failures += 1
            STATUS.update(ready=False, state="RETRY", attempts=STATUS["attempts"] + 1, error=type(exc).__name__)
            if epoch is not None:
                try:
                    java("/result", {"revision": epoch, "success": False, "collection": collection})
                except Exception:
                    pass
            time.sleep(min(30, 2 ** min(failures, 5)))


def search(body):
    if not isinstance(body.get("query"), str) or not 1 <= len(body["query"].strip()) <= 500:
        raise ValueError("INVALID_QUERY")
    if not LOCK.acquire(blocking=False):
        raise RuntimeError("INDEX_BUSY")
    try:
        active = ACTIVE
        if not STATUS["ready"] or active is None:
            raise RuntimeError("INDEX_NOT_READY")
        if body.get("epoch") != active["epoch"] or body.get("digest") != active["digest"]:
            raise RuntimeError("INDEX_STALE")
        started = time.monotonic()
        query = body["query"]
        docs = active["documents"]
        ids = [d.metadata["clause_id"] for d in docs]
        lexical = [h["clause_id"] for h in active["lexical"].search(query, 20)]
        if not docs:
            return {"ids": [], "method": "HYBRID_RRF_RERANK", "epoch": active["epoch"]}
        vector = encoder.encode([CONFIG["query_instruction"] + query], normalize_embeddings=True)
        dense = client.search(collection_name=active["collection"], data=vector.tolist(), limit=min(20, len(docs)), timeout=2)
        fused = rrf([lexical, [ids[int(h["id"])] for h in dense[0]]], CONFIG["rrf_constant"])[:20]
        lookup = {d.metadata["clause_id"]: d for d in docs}
        scores = reranker.predict([[query, lookup[k].metadata["title"] + "：" + lookup[k].page_content] for k in fused],
                                  batch_size=16, show_progress_bar=False).tolist()
        ranked = [k for k, score in sorted(zip(fused, scores), key=lambda pair: (-pair[1], pair[0]))][:5]
        return {"ids": ranked, "method": "HYBRID_RRF_RERANK", "epoch": active["epoch"],
                "index_generation": active["collection"], "elapsed_ms": round((time.monotonic() - started) * 1000)}
    finally:
        LOCK.release()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, code, data):
        raw = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path == "/health":
            self.respond(200, {"alive": True})
        elif self.path == "/status" and hmac.compare_digest(self.headers.get("X-Aster-Index", ""), KEY):
            self.respond(200, STATUS.copy())
        else:
            self.respond(403, {"error": "FORBIDDEN"})

    def do_POST(self):
        if self.path != "/search" or not hmac.compare_digest(self.headers.get("X-Aster-Index", ""), KEY):
            return self.respond(403, {"error": "FORBIDDEN"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= 8192:
                raise ValueError("INVALID_BODY")
            body = json.loads(self.rfile.read(length))
            self.respond(200, search(body))
        except ValueError:
            self.respond(400, {"error": "INVALID_REQUEST"})
        except Exception:
            self.respond(503, {"error": "RETRIEVAL_UNAVAILABLE"})


threading.Thread(target=worker, daemon=True).start()
ThreadingHTTPServer(("0.0.0.0", 8020), Handler).serve_forever()
