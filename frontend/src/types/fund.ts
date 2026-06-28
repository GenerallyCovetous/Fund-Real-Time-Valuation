export type FundStatus = "ok" | "loading" | "failed" | "empty";

export interface FundSearchResult {
  code: string;
  name: string;
}

export interface FundValuation {
  code: string;
  name: string | null;
  estimatedNetValue: number | null;
  estimatedChangePercent: number | null;
  estimatedChangeAmount: number | null;
  netValueDate: string | null;
  valuationTime: string | null;
  status: FundStatus;
  error: string | null;
}

export interface FundSearchResponse {
  query: string;
  results: FundSearchResult[];
  updatedAt: string;
}

export interface FundValuationResponse {
  items: FundValuation[];
  updatedAt: string;
}

export interface FundPerformancePoint {
  date: string;
  dailyChangePercent: number;
}

export interface FundPerformanceResponse {
  code: string;
  items: FundPerformancePoint[];
  updatedAt: string;
}
