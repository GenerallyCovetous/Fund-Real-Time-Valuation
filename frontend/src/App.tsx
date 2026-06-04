import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFundValuations, searchFunds } from "./api/funds";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { FundSearchResult, FundValuation } from "./types/fund";

interface WatchedFund {
  code: string;
  name: string;
}

const WATCHLIST_KEY = "frtv.watchlist";

function formatPercent(value: number | null): string {
  if (value === null) {
    return "--";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatNumber(value: number | null): string {
  return value === null ? "--" : value.toFixed(4);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "--";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function movementClass(value: number | null): string {
  if (value === null || value === 0) {
    return "movement-flat";
  }
  return value > 0 ? "movement-up" : "movement-down";
}

function statusText(item: FundValuation | undefined, loading: boolean): string {
  if (loading) {
    return "更新中";
  }
  if (!item) {
    return "暂无数据";
  }
  if (item.status === "ok") {
    return "正常";
  }
  if (item.status === "empty") {
    return "暂无数据";
  }
  return "失败";
}

export default function App() {
  const [watchlist, setWatchlist] = useLocalStorage<WatchedFund[]>(WATCHLIST_KEY, []);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [searchResults, setSearchResults] = useState<FundSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [valuations, setValuations] = useState<Record<string, FundValuation>>({});
  const [loadingCodes, setLoadingCodes] = useState<Set<string>>(new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const watchedCodes = useMemo(() => watchlist.map((fund) => fund.code), [watchlist]);
  const watchedCodesKey = watchedCodes.join(",");

  const setCodesLoading = useCallback((codes: string[], loading: boolean) => {
    setLoadingCodes((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (loading) {
          next.add(code);
        } else {
          next.delete(code);
        }
      }
      return next;
    });
  }, []);

  const refreshCodes = useCallback(
    async (codes: string[], force: boolean) => {
      if (codes.length === 0) {
        return;
      }
      setRefreshError(null);
      setCodesLoading(codes, true);
      try {
        const response = await fetchFundValuations(codes, force);
        setValuations((current) => {
          const next = { ...current };
          for (const item of response.items) {
            next[item.code] = item;
          }
          return next;
        });
        setLastUpdatedAt(response.updatedAt);
      } catch (error) {
        setRefreshError(error instanceof Error ? error.message : "刷新失败");
      } finally {
        setCodesLoading(codes, false);
      }
    },
    [setCodesLoading],
  );

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    searchFunds(trimmed)
      .then((response) => {
        if (!cancelled) {
          setSearchResults(response.results);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(error instanceof Error ? error.message : "搜索失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    if (!watchedCodesKey) {
      return;
    }
    const missingCodes = watchedCodes.filter((code) => valuations[code] === undefined);
    if (missingCodes.length > 0) {
      void refreshCodes(missingCodes, false);
    }
  }, [refreshCodes, valuations, watchedCodes, watchedCodesKey]);

  const addFund = (fund: FundSearchResult) => {
    if (watchlist.some((item) => item.code === fund.code)) {
      setNotice("已关注该基金");
      return;
    }
    setWatchlist([...watchlist, { code: fund.code, name: fund.name }]);
    setNotice("已添加");
    setQuery("");
    setSearchResults([]);
  };

  const removeFund = (code: string) => {
    setWatchlist(watchlist.filter((fund) => fund.code !== code));
    setValuations((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });
    setNotice("已移除");
  };

  const refreshAll = async () => {
    setIsRefreshingAll(true);
    await refreshCodes(watchedCodes, true);
    setIsRefreshingAll(false);
  };

  const lastUpdatedText = lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "--";

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="基金实时估值工作台">
        <header className="topbar">
          <div>
            <p className="eyebrow">Real-time valuation</p>
            <h1>Fund Real Time Valuation</h1>
          </div>
          <div className="topbar-actions">
            <span className="updated-at">更新 {lastUpdatedText}</span>
            <button
              className="primary-button"
              type="button"
              disabled={watchlist.length === 0 || isRefreshingAll}
              onClick={() => void refreshAll()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              刷新
            </button>
          </div>
        </header>

        <section className="search-panel" aria-label="搜索基金">
          <div className="search-box">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入基金代码或名称"
              aria-label="输入基金代码或名称"
            />
          </div>
          <div className="feedback-line" role="status">
            {isSearching ? "搜索中" : notice}
          </div>
          {searchError ? <p className="inline-error">{searchError}</p> : null}
          {searchResults.length > 0 ? (
            <div className="search-results">
              {searchResults.map((fund) => {
                const alreadyAdded = watchlist.some((item) => item.code === fund.code);
                return (
                  <button
                    className="search-result"
                    type="button"
                    key={fund.code}
                    onClick={() => addFund(fund)}
                  >
                    <span>
                      <strong>{fund.name}</strong>
                      <small>{fund.code}</small>
                    </span>
                    <span className="result-action">
                      <Plus size={15} aria-hidden="true" />
                      {alreadyAdded ? "已关注" : "添加"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        {refreshError ? <p className="global-error">{refreshError}</p> : null}

        <section className="fund-list" aria-label="已关注基金">
          {watchlist.length === 0 ? (
            <div className="empty-state">
              <h2>还没有关注基金</h2>
              <p>搜索基金代码或名称后添加到列表。</p>
            </div>
          ) : (
            <>
              <div className="fund-list-header">
                <span>基金</span>
                <span>估算净值</span>
                <span>估算涨跌幅</span>
                <span>净值日期</span>
                <span>估值时间</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              <div className="fund-list-body">
                {watchlist.map((fund) => {
                  const item = valuations[fund.code];
                  const loading = loadingCodes.has(fund.code);
                  const movement = item?.estimatedChangePercent ?? null;
                  return (
                    <article className="fund-row" key={fund.code}>
                      <div className="fund-identity">
                        <strong>{item?.name ?? fund.name}</strong>
                        <span>{fund.code}</span>
                      </div>
                      <div className="metric" data-label="估算净值">
                        {formatNumber(item?.estimatedNetValue ?? null)}
                      </div>
                      <div className={`metric movement ${movementClass(movement)}`} data-label="估算涨跌幅">
                        {formatPercent(movement)}
                        {item?.estimatedChangeAmount !== null &&
                        item?.estimatedChangeAmount !== undefined ? (
                          <small>{item.estimatedChangeAmount.toFixed(4)}</small>
                        ) : null}
                      </div>
                      <div className="metric secondary" data-label="净值日期">
                        {item?.netValueDate ?? "--"}
                      </div>
                      <div className="metric secondary" data-label="估值时间">
                        {item?.valuationTime ?? "--"}
                      </div>
                      <div className="status-cell" data-label="状态">
                        <span className={`status-pill status-${item?.status ?? "empty"}`}>
                          {statusText(item, loading)}
                        </span>
                        {item?.error ? <small>{item.error}</small> : null}
                      </div>
                      <div className="row-actions" data-label="操作">
                        <button
                          className="icon-button"
                          type="button"
                          title="刷新"
                          aria-label={`刷新 ${fund.name}`}
                          disabled={loading}
                          onClick={() => void refreshCodes([fund.code], true)}
                        >
                          <RefreshCw size={16} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          title="移除"
                          aria-label={`移除 ${fund.name}`}
                          onClick={() => removeFund(fund.code)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
