from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx

from app.models.fund import FundSearchResult, FundValuation

FUND_LIST_URL = "https://fund.eastmoney.com/js/fundcode_search.js"
VALUATION_URL_TEMPLATE = "https://fundgz.1234567.com.cn/js/{code}.js"


def decode_fund_list_payload(content: bytes) -> str:
    for encoding in ("utf-8", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue

    return content.decode("utf-8", errors="replace")


def parse_fund_search_payload(
    payload: str, query: str, limit: int = 10
) -> list[FundSearchResult]:
    fund_rows = _extract_fund_rows(payload)
    if not fund_rows:
        return []

    normalized_query = query.strip().lower()
    if not normalized_query:
        return []

    results: list[FundSearchResult] = []
    for row in fund_rows:
        if not isinstance(row, list) or len(row) < 3:
            continue

        code = str(row[0])
        name = str(row[2])
        searchable_values = [
            code.lower(),
            str(row[1]).lower(),
            name.lower(),
        ]
        if len(row) > 4 and row[4] is not None:
            searchable_values.append(str(row[4]).lower())

        if not any(normalized_query in value for value in searchable_values):
            continue

        try:
            results.append(FundSearchResult(code=code, name=name))
        except ValueError:
            continue

        if len(results) >= limit:
            break

    return results


def parse_valuation_payload(code: str, payload: str) -> FundValuation:
    jsonp_match = re.search(r"jsonpgz\((.*)\)\s*;?\s*$", payload.strip(), re.DOTALL)
    if jsonp_match is None:
        return _failed_valuation(code, "valuation data not available")

    json_payload = jsonp_match.group(1).strip()
    if not json_payload:
        return _failed_valuation(code, "valuation data not available")

    try:
        data = json.loads(json_payload)
    except json.JSONDecodeError as exc:
        return _failed_valuation(code, f"malformed valuation data: {exc.msg}")

    if not isinstance(data, dict):
        return _failed_valuation(code, "valuation data not available")

    fund_code = str(data.get("fundcode") or code)
    name = data.get("name")
    gsz = data.get("gsz")
    if gsz in (None, ""):
        return FundValuation(
            code=fund_code,
            name=str(name) if name is not None else None,
            estimated_net_value=None,
            estimated_change_percent=None,
            net_value_date=_optional_string(data.get("jzrq")),
            valuation_time=_optional_string(data.get("gztime")),
            status="empty",
            error="valuation data is empty",
        )

    try:
        estimated_net_value = float(gsz)
        estimated_change_percent = _optional_float(data.get("gszzl"))
    except (TypeError, ValueError) as exc:
        return _failed_valuation(fund_code, f"malformed valuation data: {exc}")

    return FundValuation(
        code=fund_code,
        name=str(name) if name is not None else None,
        estimated_net_value=estimated_net_value,
        estimated_change_percent=estimated_change_percent,
        net_value_date=_optional_string(data.get("jzrq")),
        valuation_time=_optional_string(data.get("gztime")),
        status="ok",
        error=None,
    )


class EastmoneyFundAdapter:
    def __init__(self, timeout_seconds: float = 5.0) -> None:
        self.timeout_seconds = timeout_seconds
        self._fund_list_payload: str | None = None

    async def search(self, query: str) -> list[FundSearchResult]:
        if self._fund_list_payload is None:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                trust_env=False,
            ) as client:
                response = await client.get(FUND_LIST_URL)
                response.raise_for_status()
                self._fund_list_payload = decode_fund_list_payload(response.content)

        return parse_fund_search_payload(self._fund_list_payload, query)

    async def get_valuation(self, code: str) -> FundValuation:
        url = VALUATION_URL_TEMPLATE.format(code=code)
        async with httpx.AsyncClient(
            timeout=self.timeout_seconds,
            trust_env=False,
        ) as client:
            response = await client.get(url, params={"rt": str(int(time.time() * 1000))})

        if response.status_code == 404:
            return _failed_valuation(code, "valuation data not available")

        response.raise_for_status()
        return parse_valuation_payload(code, response.text)


def _extract_fund_rows(payload: str) -> list[Any]:
    match = re.search(r"var\s+r\s*=\s*(\[.*\])\s*;?\s*$", payload.strip(), re.DOTALL)
    if match is None:
        return []

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    return data


def _failed_valuation(code: str, error: str) -> FundValuation:
    return FundValuation(
        code=code,
        name=None,
        estimated_net_value=None,
        estimated_change_percent=None,
        status="failed",
        error=error,
    )


def _optional_float(value: object) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def _optional_string(value: object) -> str | None:
    if value in (None, ""):
        return None
    return str(value)
