import importlib.util
from pathlib import Path
import httpx

spec=importlib.util.spec_from_file_location("benchmark",Path(__file__).parents[1]/"scripts/benchmark-read-api.py")
bench=importlib.util.module_from_spec(spec);spec.loader.exec_module(bench)


def test_http_200_business_failure_is_not_success():
    assert not bench.valid(httpx.Response(200,json={"code":401,"data":{}}),"refund_monitor")
    assert not bench.valid(httpx.Response(200,json={"code":200,"data":{}}),"catalog")
    assert bench.valid(httpx.Response(200,json={"code":200,"data":{"list":[]}}),"catalog")


def test_latency_includes_errors_and_reports_correct_denominator():
    result=bench.metrics([{"ok":True,"ms":10},{"ok":False,"ms":1000}],2)
    assert result["error_rate"]==.5 and result["p95_ms"]==1000
    assert result["completed_rps"]==1 and result["successful_rps"]==.5
