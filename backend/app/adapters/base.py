from __future__ import annotations

from typing import Protocol

from app.models.fund import FundSearchResult, FundValuation


class FundDataAdapter(Protocol):
    async def search(self, query: str) -> list[FundSearchResult]:
        ...

    async def get_valuation(self, code: str) -> FundValuation:
        ...
