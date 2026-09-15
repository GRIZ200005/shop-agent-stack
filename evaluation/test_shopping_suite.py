import json
from pathlib import Path
from aster_agent.shopping_eval import load_suite


def test_frozen_split_hash_counts_and_product_labels():
    directory=Path(__file__).parent
    suite,digest=load_suite(directory/"shopping-dialogues-v1.json")
    manifest=json.loads((directory/"shopping-split-manifest.json").read_text())
    assert digest==manifest["sha256"]
    for split in ("dev","reserved"):
        cases=[c for c in suite["scenarios"] if c["split"]==split]
        assert len(cases)==6 and sum(len(c["turns"]) for c in cases)==12
        for c in cases:
            for turn in c["turns"]:
                assert all(10001<=p<=10100 for p in turn["expect"].get("products",[]))
