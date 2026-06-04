import pytest
from fastapi.testclient import TestClient

from app.core.cache import TTLCache
from app.models.fund import FundSearchResult, FundValuation
from app.main import app
from app.services.fund_service import FundService


client = TestClient(app)


class FakeAdapter:
    def __init__(self) -> None:
        self.search_queries: list[str] = []
        self.valuation_codes: list[str] = []

    async def search(self, query: str) -> list[FundSearchResult]:
        self.search_queries.append(query)
        return [FundSearchResult(code="161725", name="Fund")]

    async def get_valuation(self, code: str) -> FundValuation:
        self.valuation_codes.append(code)
        return FundValuation(
            code=code,
            name="Fund",
            estimatedNetValue=1.0 + len(self.valuation_codes),
            estimatedChangePercent=0.1,
            status="ok",
        )


def test_health_returns_ok():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_search_empty_query_returns_422():
    response = client.get("/api/funds/search?q=")

    assert response.status_code == 422


def test_valuations_empty_codes_returns_422():
    response = client.post("/api/funds/valuations", json={"codes": [], "force": False})

    assert response.status_code == 422


def test_search_endpoint_returns_aliases(monkeypatch):
    fake_adapter = FakeAdapter()
    fake_service = FundService(
        adapter=fake_adapter,
        search_cache=TTLCache[list[FundSearchResult]](ttl_seconds=60),
        valuation_cache=TTLCache[FundValuation](ttl_seconds=60),
    )
    monkeypatch.setattr("app.api.funds.service", fake_service)

    response = client.get("/api/funds/search?q= Fund ")

    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "Fund"
    assert "updatedAt" in data
    assert "updated_at" not in data
    assert data["results"] == [{"code": "161725", "name": "Fund"}]


@pytest.mark.asyncio
async def test_service_search_trims_query_and_caches_by_lowercase():
    fake_adapter = FakeAdapter()
    service = FundService(
        adapter=fake_adapter,
        search_cache=TTLCache[list[FundSearchResult]](ttl_seconds=60),
        valuation_cache=TTLCache[FundValuation](ttl_seconds=60),
    )

    first = await service.search(" Fund ")
    second = await service.search("fund")

    assert first.query == "Fund"
    assert second.query == "fund"
    assert fake_adapter.search_queries == ["Fund"]


@pytest.mark.asyncio
async def test_service_valuations_cache_ok_items_and_force_bypasses_cache():
    fake_adapter = FakeAdapter()
    service = FundService(
        adapter=fake_adapter,
        search_cache=TTLCache[list[FundSearchResult]](ttl_seconds=60),
        valuation_cache=TTLCache[FundValuation](ttl_seconds=60),
    )

    first = await service.valuations(["161725"])
    second = await service.valuations(["161725"])
    forced = await service.valuations(["161725"], force=True)

    assert first.items[0].estimated_net_value == 2.0
    assert second.items[0].estimated_net_value == 2.0
    assert forced.items[0].estimated_net_value == 3.0
    assert fake_adapter.valuation_codes == ["161725", "161725"]
