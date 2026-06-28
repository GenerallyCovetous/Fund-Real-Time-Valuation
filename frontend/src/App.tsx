import {
  Activity,
  Clock3,
  Gauge,
  LineChart,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFundPerformance, fetchFundValuations, searchFunds } from "./api/funds";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { FundPerformancePoint, FundSearchResult, FundValuation } from "./types/fund";

interface WatchedFund {
  code: string;
  name: string;
}

const WATCHLIST_KEY = "frtv.watchlist";
const AUTO_REFRESH_MS = 60_000;
const PERFORMANCE_DAYS = 30;

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
  if (!item || item.status === "empty") {
    return "暂无数据";
  }
  if (item.status === "ok") {
    return "正常";
  }
  return "失败";
}

function rangeText(points: FundPerformancePoint[]): string {
  if (points.length === 0) {
    return "暂无走势";
  }
  const first = points[0]?.date ?? "";
  const last = points[points.length - 1]?.date ?? "";
  return `${first} 至 ${last}`;
}

function PerformanceStrip({ points }: { points: FundPerformancePoint[] }) {
  const latest = points.length > 0 ? points[points.length - 1].dailyChangePercent : null;
  const maxAbs = Math.max(0.5, ...points.map((point) => Math.abs(point.dailyChangePercent)));

  return (
    <div className="performance-panel" aria-label="近 30 日业绩走势">
      <div className="performance-head">
        <div>
          <span>近 30 日业绩走势</span>
          <small>{rangeText(points)}</small>
        </div>
        <strong className={movementClass(latest)}>{formatPercent(latest)}</strong>
      </div>
      <div className="performance-chart" role="img" aria-label="一个月内每日涨跌幅百分比">
        {points.length === 0 ? (
          <span className="chart-empty">等待历史走势</span>
        ) : (
          points.map((point) => {
            const height = Math.max(10, Math.round((Math.abs(point.dailyChangePercent) / maxAbs) * 54));
            return (
              <span
                className={`chart-bar ${point.dailyChangePercent >= 0 ? "bar-up" : "bar-down"}`}
                key={point.date}
                style={{ height: `${height}px` }}
                title={`${point.date} ${formatPercent(point.dailyChangePercent)}`}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [watchlist, setWatchlist] = useLocalStorage<WatchedFund[]>(WATCHLIST_KEY, []);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [searchResults, setSearchResults] = useState<FundSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [valuations, setValuations] = useState<Record<string, FundValuation>>({});
  const [performanceByCode, setPerformanceByCode] = useState<Record<string, FundPerformancePoint[]>>({});
  const [loadingCodes, setLoadingCodes] = useState<Set<string>>(new Set());
  const [performanceLoadingCodes, setPerformanceLoadingCodes] = useState<Set<string>>(new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const watchedCodes = useMemo(() => watchlist.map((fund) => fund.code), [watchlist]);
  const watchedCodesKey = watchedCodes.join(",");

  const portfolioStats = useMemo(() => {
    const items = watchedCodes.map((code) => valuations[code]).filter((item): item is FundValuation => Boolean(item));
    const validChanges = items
      .map((item) => item.estimatedChangePercent)
      .filter((value): value is number => value !== null);
    const averageChange =
      validChanges.length > 0 ? validChanges.reduce((sum, value) => sum + value, 0) / validChanges.length : null;
    const positiveCount = validChanges.filter((value) => value > 0).length;
    const negativeCount = validChanges.filter((value) => value < 0).length;
    const latestPerformanceCount = watchedCodes.filter((code) => (performanceByCode[code]?.length ?? 0) > 0).length;

    return {
      averageChange,
      latestPerformanceCount,
      negativeCount,
      positiveCount,
      valuedCount: items.length,
      watchedCount: watchlist.length,
    };
  }, [performanceByCode, valuations, watchedCodes, watchlist.length]);

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

  const setPerformanceLoading = useCallback((codes: string[], loading: boolean) => {
    setPerformanceLoadingCodes((current) => {
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

  const refreshPerformance = useCallback(
    async (codes: string[]) => {
      if (codes.length === 0) {
        return;
      }
      setPerformanceLoading(codes, true);
      try {
        const responses = await Promise.all(codes.map((code) => fetchFundPerformance(code, PERFORMANCE_DAYS)));
        setPerformanceByCode((current) => {
          const next = { ...current };
          for (const response of responses) {
            next[response.code] = response.items;
          }
          return next;
        });
      } catch (error) {
        setRefreshError(error instanceof Error ? error.message : "走势更新失败");
      } finally {
        setPerformanceLoading(codes, false);
      }
    },
    [setPerformanceLoading],
  );

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

  useEffect(() => {
    if (!watchedCodesKey) {
      return;
    }
    const missingCodes = watchedCodes.filter((code) => performanceByCode[code] === undefined);
    if (missingCodes.length > 0) {
      void refreshPerformance(missingCodes);
    }
  }, [performanceByCode, refreshPerformance, watchedCodes, watchedCodesKey]);

  useEffect(() => {
    if (!watchedCodesKey) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void refreshCodes(watchedCodes, true);
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshCodes, watchedCodes, watchedCodesKey]);

  const addFund = (fund: FundSearchResult) => {
    if (watchlist.some((item) => item.code === fund.code)) {
      setNotice("已关注该基金");
      return;
    }
    setWatchlist([...watchlist, { code: fund.code, name: fund.name }]);
    setNotice("已添加到关注列表");
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
    setPerformanceByCode((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });
    setNotice("已移除");
  };

  const refreshAll = async () => {
    setIsRefreshingAll(true);
    await Promise.all([refreshCodes(watchedCodes, true), refreshPerformance(watchedCodes)]);
    setIsRefreshingAll(false);
  };

  const lastUpdatedText = lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "--";

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="基金实时估值工作台">
        <header className="topbar">
          <div className="brand-block">
            <p className="eyebrow">Real-time Fund Console</p>
            <h1>基金实时估值雷达</h1>
            <p className="intro">跟踪关注基金估值、自动刷新行情，并观察近 30 日每日涨跌幅。</p>
          </div>
          <div className="topbar-actions" aria-label="刷新控制">
            <span className="live-dot" aria-hidden="true" />
            <span className="updated-at">最近更新 {lastUpdatedText}</span>
            <span className="auto-refresh"><Clock3 size={14} aria-hidden="true" />60s 自动刷新</span>
            <button
              className="primary-button"
              type="button"
              disabled={watchlist.length === 0 || isRefreshingAll}
              onClick={() => void refreshAll()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              刷新全部
            </button>
          </div>
        </header>

        <section className="overview-strip" aria-label="关注概览">
          <div className="overview-item">
            <Gauge size={18} aria-hidden="true" />
            <span>关注基金</span>
            <strong>{portfolioStats.watchedCount}</strong>
          </div>
          <div className="overview-item">
            <Activity size={18} aria-hidden="true" />
            <span>已有估值</span>
            <strong>{portfolioStats.valuedCount}</strong>
          </div>
          <div className="overview-item">
            <LineChart size={18} aria-hidden="true" />
            <span>近月走势</span>
            <strong>{portfolioStats.latestPerformanceCount}</strong>
          </div>
          <div className="overview-item trend-summary">
            <span>平均涨跌幅</span>
            <strong className={movementClass(portfolioStats.averageChange)}>{formatPercent(portfolioStats.averageChange)}</strong>
            <small>
              <TrendingUp size={14} aria-hidden="true" /> {portfolioStats.positiveCount}
              <TrendingDown size={14} aria-hidden="true" /> {portfolioStats.negativeCount}
            </small>
          </div>
        </section>

        <section className="search-panel" aria-label="搜索基金">
          <div className="search-copy">
            <h2>添加关注</h2>
            <p>输入基金代码或名称，选择结果后加入工作台。</p>
          </div>
          <div className="search-control">
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
              {isSearching ? "正在搜索" : notice}
            </div>
            {searchError ? <p className="inline-error">{searchError}</p> : null}
          </div>
          {searchResults.length > 0 ? (
            <div className="search-results">
              {searchResults.map((fund) => {
                const alreadyAdded = watchlist.some((item) => item.code === fund.code);
                return (
                  <button className="search-result" type="button" key={fund.code} onClick={() => addFund(fund)}>
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
          <div className="section-heading">
            <div>
              <p className="eyebrow">Watchlist</p>
              <h2>已关注基金</h2>
            </div>
            <span>{watchlist.length} 只基金</span>
          </div>

          {watchlist.length === 0 ? (
            <div className="empty-state">
              <h2>还没有关注基金</h2>
              <p>搜索基金代码或名称后添加到列表，页面会自动拉取估值和近 30 日业绩走势。</p>
            </div>
          ) : (
            <div className="fund-list-body">
              {watchlist.map((fund) => {
                const item = valuations[fund.code];
                const loading = loadingCodes.has(fund.code);
                const trendLoading = performanceLoadingCodes.has(fund.code);
                const movement = item?.estimatedChangePercent ?? null;
                const points = performanceByCode[fund.code] ?? [];
                return (
                  <article className="fund-row" key={fund.code}>
                    <div className="fund-row-main">
                      <div className="fund-identity">
                        <strong>{item?.name ?? fund.name}</strong>
                        <span>{fund.code}</span>
                      </div>
                      <div className="metric" data-label="估算净值">
                        <span>估算净值</span>
                        <strong>{formatNumber(item?.estimatedNetValue ?? null)}</strong>
                      </div>
                      <div className={`metric movement ${movementClass(movement)}`} data-label="估算涨跌幅">
                        <span>估算涨跌幅</span>
                        <strong>{formatPercent(movement)}</strong>
                        {item?.estimatedChangeAmount !== null && item?.estimatedChangeAmount !== undefined ? (
                          <small>{item.estimatedChangeAmount.toFixed(4)}</small>
                        ) : null}
                      </div>
                      <div className="metric secondary" data-label="净值日期">
                        <span>净值日期</span>
                        <strong>{item?.netValueDate ?? "--"}</strong>
                      </div>
                      <div className="metric secondary" data-label="估值时间">
                        <span>估值时间</span>
                        <strong>{item?.valuationTime ?? "--"}</strong>
                      </div>
                      <div className="status-cell" data-label="状态">
                        <span className={`status-pill status-${item?.status ?? "empty"}`}>{statusText(item, loading)}</span>
                        {trendLoading ? <small>走势更新中</small> : item?.error ? <small>{item.error}</small> : null}
                      </div>
                      <div className="row-actions" data-label="操作">
                        <button
                          className="icon-button"
                          type="button"
                          title="刷新"
                          aria-label={`刷新 ${fund.name}`}
                          disabled={loading}
                          onClick={() => void Promise.all([refreshCodes([fund.code], true), refreshPerformance([fund.code])])}
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
                    </div>
                    <PerformanceStrip points={points} />
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
