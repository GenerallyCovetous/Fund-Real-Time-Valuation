import type { FundSearchResponse, FundValuationResponse } from "../types/fund";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function searchFunds(query: string): Promise<FundSearchResponse> {
  const response = await fetch(`/api/funds/search?q=${encodeURIComponent(query)}`);
  return readJson<FundSearchResponse>(response);
}

export async function fetchFundValuations(
  codes: string[],
  force = false,
): Promise<FundValuationResponse> {
  const response = await fetch("/api/funds/valuations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codes, force }),
  });
  return readJson<FundValuationResponse>(response);
}
