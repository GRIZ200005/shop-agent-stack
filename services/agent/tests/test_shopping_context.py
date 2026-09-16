import pytest
from shop_agent_stack import context
from test_task_context import claim


def test_shopping_correction_reference_and_reset():
    task=claim(context.empty(),{"budget":"50元","category":"玻璃杯"},"50元玻璃杯")
    task=context.observe_products(task,[{"id":10002,"name":"澄光杯","price":29,"skus":[]}])
    task=claim(task,{"budget":"20元"},"改成20元")
    assert task["facts"]["budget"]["quote"]=="20元"
    assert task["recent_products"]==[{"id":10002,"name":"澄光杯"}]
    assert "price" not in str(task) and "skus" not in str(task)
    assert context.update(task,{"action":"reset","facts":{}},"重新选","r2")==context.empty()


def test_model_cannot_inject_host_product_references():
    with pytest.raises(ValueError):
        claim(context.empty(),{"recent_products":"G1"},"G1")


def test_product_reference_survives_history_truncation_and_legacy_tasks():
    task={"schema_version":1,"facts":{},"pending_fields":[],"verified_order_id":None}
    task=context.observe_products(task,[{"id":10003,"name":"远山保温杯"}])
    messages,stats=context.build([{"role":"assistant","content":"x"*13000}],task,"这款可以加热吗？")
    assert stats["dropped_messages"]==1 and '10003' in str(messages)
