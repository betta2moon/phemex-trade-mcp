import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSymbols, filterByContractType } from "../tools/list-symbols.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const MOCK_PRODUCTS_RESPONSE = {
  code: 0,
  msg: "OK",
  data: {
    products: [
      { symbol: "BTCUSD", type: "Perpetual", status: "Listed" },
      { symbol: "ETHUSD", type: "Perpetual", status: "Listed" },
      { symbol: "XRPUSD", type: "Perpetual", status: "Delisted" },
      { symbol: "sBTCUSDT", type: "Spot", status: "Listed" },
      { symbol: "sETHUSDT", type: "Spot", status: "Listed" },
      { symbol: "sXRPUSDT", type: "Spot", status: "Delisted" },
    ],
    perpProductsV2: [
      { symbol: "BTCUSDT", type: "PerpetualV2", status: "Listed" },
      { symbol: "ETHUSDT", type: "PerpetualV2", status: "Listed" },
      { symbol: "SOLUSDT", type: "PerpetualV2", status: "Listed" },
      { symbol: "DOGEUSDT", type: "PerpetualV2", status: "Delisted" },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve(MOCK_PRODUCTS_RESPONSE),
  });
});

describe("fetchSymbols", () => {
  it("returns symbols grouped by contract type", async () => {
    const result = await fetchSymbols("https://testnet-api.phemex.com");
    expect(result.linear).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    expect(result.inverse).toEqual(["BTCUSD", "ETHUSD"]);
    expect(result.spot).toEqual(["BTCUSDT", "ETHUSDT"]);
  });

  it("excludes delisted symbols", async () => {
    const result = await fetchSymbols("https://testnet-api.phemex.com");
    expect(result.linear).not.toContain("DOGEUSDT");
    expect(result.inverse).not.toContain("XRPUSD");
    expect(result.spot).not.toContain("XRPUSDT");
  });

  it("removes s prefix from spot symbols", async () => {
    const result = await fetchSymbols("https://testnet-api.phemex.com");
    expect(result.spot).not.toContain("sBTCUSDT");
    expect(result.spot).toContain("BTCUSDT");
  });

  it("returns sorted lists", async () => {
    const result = await fetchSymbols("https://testnet-api.phemex.com");
    const linearSorted = [...result.linear!].sort();
    expect(result.linear).toEqual(linearSorted);
  });

  it("calls correct API endpoint", async () => {
    await fetchSymbols("https://api.phemex.com");
    expect(mockFetch).toHaveBeenCalledWith("https://api.phemex.com/public/products");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ code: 500, data: {} }),
    });
    await expect(fetchSymbols("https://api.phemex.com")).rejects.toThrow("API error");
  });
});

describe("filterByContractType", () => {
  const allSymbols = {
    linear: ["BTCUSDT", "ETHUSDT"],
    inverse: ["BTCUSD"],
    spot: ["BTCUSDT"],
  };

  it("returns all when no filter", () => {
    expect(filterByContractType(allSymbols)).toEqual(allSymbols);
  });

  it("filters to linear only", () => {
    const result = filterByContractType(allSymbols, "linear");
    expect(result).toEqual({ linear: ["BTCUSDT", "ETHUSDT"] });
    expect(result).not.toHaveProperty("inverse");
    expect(result).not.toHaveProperty("spot");
  });

  it("filters to inverse only", () => {
    const result = filterByContractType(allSymbols, "inverse");
    expect(result).toEqual({ inverse: ["BTCUSD"] });
    expect(result).not.toHaveProperty("linear");
  });

  it("filters to spot only", () => {
    const result = filterByContractType(allSymbols, "spot");
    expect(result).toEqual({ spot: ["BTCUSDT"] });
    expect(result).not.toHaveProperty("linear");
  });
});
