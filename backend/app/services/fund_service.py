from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.adapters.base import FundDataAdapter
from app.core.cache import TTLCache
from app.models.fund import FundSearchResponse, FundSearchResult, FundValuation, FundValuationResponse


class FundService:
    def __init__(
        self,
        adapter: FundDataAdapter,
        search_cache: TTLCache[list[FundSearchResult]],
        valuation_cache: TTLCache[FundValuation],
    ) -> None:
        self.adapter = adapter
        self.search_cache = search_cache
        self.valuation_cache = valuation_cache

    async def search(self, query: str) -> FundSearchResponse:
        normalized = query.strip()
        cache_key = f"search:{normalized.lower()}"
        cached = self.search_cache.get(cache_key)
        if cached is None:
            cached = await self.adapter.search(normalized)
            self.search_cache.set(cache_key, cached)

        return FundSearchResponse(
            query=normalized,
            results=cached,
            updated_at=datetime.now(UTC),
        )

    async def valuations(self, codes: list[str], force: bool = False) -> FundValuationResponse:
        items = await asyncio.gather(
            *(self._valuation(code, force=force) for code in codes)
        )
        return FundValuationResponse(items=list(items), updated_at=datetime.now(UTC))

    async def _valuation(self, code: str, force: bool) -> FundValuation:
        cache_key = f"valuation:{code}"
        if not force:
            cached = self.valuation_cache.get(cache_key)
            if cached is not None:
                return cached

        item = await self.adapter.get_valuation(code)
        if item.status == "ok":
            self.valuation_cache.set(cache_key, item)
        return item
