"""Populate the pinned local model cache without running retrieval evaluation."""
import json
from pathlib import Path


def main():
    from huggingface_hub import snapshot_download

    root = Path(__file__).resolve().parents[1]
    config = json.loads((root / "evaluation/retrieval-matrix.json").read_text(encoding="utf-8"))
    for kind in ("embedding", "reranker"):
        revision = config["model_revisions"][kind]
        if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
            raise ValueError("Model revision must be a pinned commit SHA")
        snapshot_download(
            config[kind], revision=revision,
            allow_patterns=["*.json", "*.txt", "*.safetensors", "*.model", "README.md"],
        )
        print(f"READY {kind}: {config[kind]} @ {revision}")


if __name__ == "__main__":
    main()
