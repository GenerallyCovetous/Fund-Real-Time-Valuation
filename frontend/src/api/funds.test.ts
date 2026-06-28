import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFundPerformance, fetchFundValuations, searchFunds } from "./funds";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fund API client", () => {
  it("searches with encoded query", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          query: "baijiu fund",
          results: [],
          updatedAt: "2026-06-03T12:00:00Z",
        }),
      ),
    );

    await searchFunds("baijiu fund");

    expect(fetch).toHaveBeenCalledWith("/api/funds/search?q=baijiu%20fund");
  });

  it("posts valuation request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], updatedAt: "2026-06-03T12:00:00Z" })),
    );

    await fetchFundValuations(["161725"], true);

    expect(fetch).toHaveBeenCalledWith("/api/funds/valuations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: ["161725"], force: true }),
    });
  });

  it("fetches one-month fund performance", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "161725",
          items: [{ date: "2026-06-28", dailyChangePercent: 0.99 }],
          updatedAt: "2026-06-29T12:00:00Z",
        }),
      ),
    );

    const response = await fetchFundPerformance("161725", 30);

    expect(response.items[0].dailyChangePercent).toBe(0.99);
    expect(fetch).toHaveBeenCalledWith("/api/funds/161725/performance?days=30");
  });

  it("throws response text for failed requests", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("bad request", { status: 400 }),
    );

    await expect(searchFunds("bad")).rejects.toThrow("bad request");
  });
});
