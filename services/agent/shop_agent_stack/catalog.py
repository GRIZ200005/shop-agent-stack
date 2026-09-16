"""Product evidence is a live business snapshot, never a policy document or instruction."""
import hashlib
import json


def with_snapshot(product):
    value={k:v for k,v in product.items() if k!="snapshot"}
    if type(value.get("id")) is not int or value["id"]<=0 or value.get("evidence_id")!=f"G{value['id']}":
        raise ValueError("商品证据格式不正确")
    value["snapshot"]=hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":" )).encode()).hexdigest()
    return value
