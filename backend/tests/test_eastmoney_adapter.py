import httpx
import pytest

from app.adapters.eastmoney import (
    FUND_LIST_URL,
    PERFORMANCE_URL_TEMPLATE,
    VALUATION_URL_TEMPLATE,
    EastmoneyFundAdapter,
    parse_fund_search_payload,
    parse_performance_payload,
    parse_valuation_payload,
)


FUND_LIST_PAYLOAD = """
var r = [
  ["000001","HXCZZH","华夏成长混合","混合型","HUAXIACHENGZHANGHUNHE"],
  ["161725","ZSBAI","招商中证白酒指数(LOF)A","zsbai","ZHAOSHANGZHONGZHENGBAIJIUZHISHU"],
  ["110022","YFXXXF","易方达消费行业股票","yfxxxf","YIFANGDAXIAOFEIHANGYEGUPIAO"]
];
"""


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_parse_fund_search_payload_matches_chinese_name():
    results = parse_fund_search_payload(FUND_LIST_PAYLOAD, "白酒")

    assert [result.code for result in results] == ["161725"]
    assert results[0].name == "招商中证白酒指数(LOF)A"


def test_parse_fund_search_payload_matches_code_prefix():
    results = parse_fund_search_payload(FUND_LIST_PAYLOAD, "11")

    assert [result.code for result in results] == ["110022"]
    assert results[0].name == "易方达消费行业股票"


def test_parse_fund_search_payload_matches_pinyin_and_abbreviation():
    by_pinyin = parse_fund_search_payload(FUND_LIST_PAYLOAD, "yifangda")
    by_abbreviation = parse_fund_search_payload(FUND_LIST_PAYLOAD, "hxczzh")

    assert [result.code for result in by_pinyin] == ["110022"]
    assert [result.code for result in by_abbreviation] == ["000001"]


def test_parse_fund_search_payload_returns_empty_for_malformed_payload():
    assert parse_fund_search_payload("not fund data", "白酒") == []


def test_parse_fund_search_payload_does_not_match_fund_type_field():
    payload = """
var r = [
  ["020020","ALPHA","Alpha Growth","指数型","ALPHAGROWTH"]
];
"""

    assert parse_fund_search_payload(payload, "指数型") == []


def test_parse_valuation_payload_reads_normal_jsonp():
    valuation = parse_valuation_payload(
        "161725",
        'jsonpgz({"fundcode":"161725","name":"招商中证白酒指数(LOF)A",'
        '"gsz":"1.2345","gszzl":"0.67","jzrq":"2026-06-02",'
        '"gztime":"2026-06-03 14:55"});',
    )

    assert valuation.code == "161725"
    assert valuation.name == "招商中证白酒指数(LOF)A"
    assert valuation.estimated_net_value == 1.2345
    assert valuation.estimated_change_percent == 0.67
    assert valuation.net_value_date == "2026-06-02"
    assert valuation.valuation_time == "2026-06-03 14:55"
    assert valuation.status == "ok"
    assert valuation.error is None


def test_parse_performance_payload_reads_latest_daily_changes():
    performance = parse_performance_payload(
        "161725",
        """
var Data_netWorthTrend = [
  {"x":1782576000000,"y":1.0100,"equityReturn":0.12},
  {"x":1782662400000,"y":1.0200,"equityReturn":0.99},
  {"x":1782748800000,"y":1.0150,"equityReturn":-0.49}
];
var Data_ACWorthTrend = [];
""",
        days=2,
    )

    assert [point.date for point in performance] == ["2026-06-28", "2026-06-29"]
    assert [point.daily_change_percent for point in performance] == [0.99, -0.49]


def test_parse_performance_payload_skips_items_without_daily_change():
    performance = parse_performance_payload(
        "161725",
        """
var Data_netWorthTrend = [
  {"x":1782576000000,"y":1.0100},
  {"x":1782662400000,"y":1.0200,"equityReturn":""},
  {"x":1782748800000,"y":1.0150,"equityReturn":-0.49}
];
""",
        days=30,
    )

    assert len(performance) == 1
    assert performance[0].daily_change_percent == -0.49


def test_parse_valuation_payload_returns_failed_for_empty_jsonp():
    valuation = parse_valuation_payload("161725", "jsonpgz();")

    assert valuation.code == "161725"
    assert valuation.status == "failed"
    assert valuation.error == "valuation data not available"


def test_parse_valuation_payload_returns_empty_when_gsz_missing():
    valuation = parse_valuation_payload(
        "161725",
        'jsonpgz({"fundcode":"161725","name":"招商中证白酒指数(LOF)A","gsz":""});',
    )

    assert valuation.code == "161725"
    assert valuation.name == "招商中证白酒指数(LOF)A"
    assert valuation.status == "empty"
    assert valuation.error == "valuation data is empty"


@pytest.mark.anyio
async def test_adapter_search_uses_cached_fund_list(respx_mock):
    route = respx_mock.get(FUND_LIST_URL).mock(
        return_value=httpx.Response(200, text=FUND_LIST_PAYLOAD)
    )
    adapter = EastmoneyFundAdapter(timeout_seconds=1)

    first_results = await adapter.search("白酒")
    second_results = await adapter.search("161")

    assert [result.code for result in first_results] == ["161725"]
    assert [result.code for result in second_results] == ["161725"]
    assert route.call_count == 1


@pytest.mark.anyio
async def test_adapter_search_decodes_gb18030_fund_list_bytes(respx_mock):
    respx_mock.get(FUND_LIST_URL).respond(
        content=FUND_LIST_PAYLOAD.encode("gb18030")
    )
    adapter = EastmoneyFundAdapter(timeout_seconds=1)

    results = await adapter.search("白酒")

    assert [result.code for result in results] == ["161725"]


@pytest.mark.anyio
async def test_adapter_get_valuation_returns_failed_for_404(respx_mock):
    respx_mock.get(VALUATION_URL_TEMPLATE.format(code="161725")).mock(
        return_value=httpx.Response(404, text="")
    )
    adapter = EastmoneyFundAdapter(timeout_seconds=1)

    valuation = await adapter.get_valuation("161725")

    assert valuation.code == "161725"
    assert valuation.status == "failed"
    assert valuation.error == "valuation data not available"


@pytest.mark.anyio
async def test_adapter_get_performance_fetches_eastmoney_trend(respx_mock):
    respx_mock.get(PERFORMANCE_URL_TEMPLATE.format(code="161725")).mock(
        return_value=httpx.Response(
            200,
            text="""
var Data_netWorthTrend = [
  {"x":1782576000000,"y":1.0100,"equityReturn":0.12},
  {"x":1782662400000,"y":1.0200,"equityReturn":0.99}
];
""",
        )
    )
    adapter = EastmoneyFundAdapter(timeout_seconds=1)

    performance = await adapter.get_performance("161725", days=30)

    assert len(performance) == 2
    assert performance[1].daily_change_percent == 0.99
