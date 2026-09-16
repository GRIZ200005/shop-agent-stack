"""Canonical digest binds an index to authoritative visible policy content."""
import hashlib
import json


def snapshot_digest(rows):
    values = sorted((str(r["policy_id"]), int(r["version"]), int(r["clause_no"]),
                     r["title"], r["content_hash"]) for r in rows)
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
