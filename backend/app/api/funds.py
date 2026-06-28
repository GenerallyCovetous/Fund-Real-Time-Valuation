from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.adapters.eastmoney import EastmoneyFundAdapter
from app.core.cache import TTLCache
from app.core.config import settings
from app.models.fund import (
    FundCode,
    FundPerformancePoint,
    FundPerformanceResponse,
    FundSearchResponse,
    FundSearchResult,
    FundValuation,
    FundValuationRequest,
    FundValuationResponse,
)
from app.services.fund_service import FundService

router = APIRouter(prefix="/api/funds", tags=["funds"])

service = FundService(
    adapter=EastmoneyFundAdapter(timeout_seconds=settings.request_timeout_seconds),
    search_cache=TTLCache[list[FundSearchResult]](
        ttl_seconds=settings.search_cache_ttl_seconds
    ),
    valuation_cache=TTLCache[FundValuation](
        ttl_seconds=settings.valuation_cache_ttl_seconds
    ),
    performance_cache=TTLCache[list[FundPerformancePoint]](
        ttl_seconds=settings.valuation_cache_ttl_seconds
    ),
)


@router.get(
    "/search",
    response_model=FundSearchResponse,
    response_model_by_alias=True,
)
async def search_funds(q: str = Query(min_length=1, max_length=50)) -> FundSearchResponse:
    try:
        return await service.search(q)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="fund search data source failed",
        ) from exc


@router.post(
    "/valuations",
    response_model=FundValuationResponse,
    response_model_by_alias=True,
)
async def get_valuations(payload: FundValuationRequest) -> FundValuationResponse:
    try:
        return await service.valuations(payload.codes, force=payload.force)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="fund valuation data source failed",
        ) from exc


@router.get(
    "/{code}/performance",
    response_model=FundPerformanceResponse,
    response_model_by_alias=True,
)
async def get_performance(
    code: FundCode,
    days: int = Query(default=30, ge=1, le=60),
) -> FundPerformanceResponse:
    try:
        return await service.performance(code, days=days)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="fund performance data source failed",
        ) from exc
