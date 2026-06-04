import time

from app.core.cache import TTLCache


def test_cache_returns_value_before_ttl_expires():
    cache = TTLCache[str](ttl_seconds=60)

    cache.set("fund:161725", "cached")

    assert cache.get("fund:161725") == "cached"


def test_cache_returns_none_after_ttl_expires():
    cache = TTLCache[str](ttl_seconds=0.01)
    cache.set("fund:161725", "cached")

    time.sleep(0.02)

    assert cache.get("fund:161725") is None


def test_cache_can_be_bypassed_by_calling_delete():
    cache = TTLCache[str](ttl_seconds=60)
    cache.set("fund:161725", "cached")

    cache.delete("fund:161725")

    assert cache.get("fund:161725") is None
