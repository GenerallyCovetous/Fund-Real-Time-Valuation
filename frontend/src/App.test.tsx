import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const fundName = "招商中证白酒指数(LOF)A";

const valuationResponse = {
  items: [
    {
      code: "161725",
      name: fundName,
      estimatedNetValue: 0.9123,
      estimatedChangePercent: 1.37,
      estimatedChangeAmount: null,
      netValueDate: "2026-06-02",
      valuationTime: "2026-06-03 14:55",
      status: "ok",
      error: null,
    },
  ],
  updatedAt: "2026-06-03T12:00:00Z",
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("renders a readable empty workspace", () => {
    render(<App />);

    expect(screen.getByText("还没有关注基金")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入基金代码或名称")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新全部" })).toBeDisabled();
  });

  it("searches and adds a fund", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/funds/search")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              query: "白酒",
              results: [{ code: "161725", name: fundName }],
              updatedAt: "2026-06-03T12:00:00Z",
            }),
          ),
        );
      }
      if (url === "/api/funds/valuations") {
        return Promise.resolve(new Response(JSON.stringify(valuationResponse)));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("输入基金代码或名称"), {
      target: { value: "白酒" },
    });

    const result = await screen.findByText(fundName);
    fireEvent.click(result);

    await waitFor(() => {
      expect(screen.getByText("161725")).toBeInTheDocument();
      expect(screen.getAllByText("+1.37%").length).toBeGreaterThan(0);
    });
  });

  it("removes a watched fund from local storage", async () => {
    window.localStorage.setItem("frtv.watchlist", JSON.stringify([{ code: "161725", name: fundName }]));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(valuationResponse)));

    render(<App />);

    await screen.findAllByText("+1.37%");
    fireEvent.click(screen.getByLabelText(`移除 ${fundName}`));

    expect(screen.getByText("还没有关注基金")).toBeInTheDocument();
    expect(window.localStorage.getItem("frtv.watchlist")).toBe("[]");
  });
});
