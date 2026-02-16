import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductInfoCache } from "../product-info.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock data matches real Phemex API format:
// priceScale/ratioScale are EXPONENTS (4 means 10^4 = 10000)
// valueScale comes from currencies array
const MOCK_PRODUCTS_RESPONSE = {
  code: 0,
  msg: "OK",
  data: {
    currencies: [
      { currency: "BTC", valueScale: 8 },
      { currency: "ETH", valueScale: 8 },
      { currency: "USDT", valueScale: 8 },
      { currency: "SOL", valueScale: 8 },
    ],
    products: [
      {
        symbol: "BTCUSD",
        type: "Perpetual",
        status: "Listed",
        settleCurrency: "BTC",
        priceScale: 4,       // 10^4 = 10000
        ratioScale: 8,       // 10^8 = 100000000
        contractSize: 1,
      },
      {
        symbol: "ETHUSD",
        type: "Perpetual",
        status: "Listed",
        settleCurrency: "ETH",
        priceScale: 4,
        ratioScale: 8,
        contractSize: 1,
      },
      {
        symbol: "SOLUSD",
        type: "Perpetual",
        status: "Delisted",  // should be filtered out
        settleCurrency: "USD",
        priceScale: 4,
        ratioScale: 8,
        contractSize: 1,
      },
      {
        symbol: "cSOLUSD",
        type: "Perpetual",
        status: "Listed",
        settleCurrency: "SOL",
        priceScale: 4,
        ratioScale: 8,
        contractSize: 1,
      },
      // Spot products (in same products array, type="Spot")
      {
        symbol: "sBTCUSDT",
        type: "Spot",
        status: "Listed",
        settleCurrency: "USDT",
        priceScale: 8,
        ratioScale: 8,
      },
      {
        symbol: "sETHUSDT",
        type: "Spot",
        status: "Listed",
        settleCurrency: "USDT",
        priceScale: 8,
        ratioScale: 8,
      },
      {
        symbol: "sDELISTED",
        type: "Spot",
        status: "Delisted",
        settleCurrency: "USDT",
        priceScale: 8,
        ratioScale: 8,
      },
    ],
    perpProductsV2: [
      {
        symbol: "BTCUSDT",
        type: "PerpetualV2",
        status: "Listed",
        settleCurrency: "USDT",
        priceScale: 0,        // linear uses decimal strings, scale=10^0=1
        ratioScale: 0,
      },
    ],
  },
};

describe("ProductInfoCache", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("fetches and caches inverse products on init with correct scales", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => MOCK_PRODUCTS_RESPONSE,
    });

    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    const btc = cache.get("BTCUSD");
    expect(btc).toBeDefined();
    expect(btc!.symbol).toBe("BTCUSD");
    expect(btc!.contractType).toBe("inverse");
    expect(btc!.priceScale).toBe(10000);        // 10^4
    expect(btc!.ratioScale).toBe(100000000);     // 10^8
    expect(btc!.valueScale).toBe(100000000);     // from BTC currency
  });

  it("filters out delisted products", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => MOCK_PRODUCTS_RESPONSE,
    });

    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    expect(cache.get("SOLUSD")).toBeUndefined();  // delisted
    expect(cache.get("cSOLUSD")).toBeDefined();    // listed
  });

  it("caches linear products from perpProductsV2", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => MOCK_PRODUCTS_RESPONSE,
    });

    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    const btcusdt = cache.get("BTCUSDT");
    expect(btcusdt).toBeDefined();
    expect(btcusdt!.contractType).toBe("linear");
    expect(btcusdt!.priceScale).toBe(1);  // 10^0 = 1
  });

  it("returns undefined for unknown symbol", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => MOCK_PRODUCTS_RESPONSE,
    });

    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    expect(cache.get("XYZUSD")).toBeUndefined();
  });

  it("scalePrice multiplies by priceScale (10^exponent) and rounds", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => MOCK_PRODUCTS_RESPONSE,
    });

    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    // BTCUSD priceScale=10^4=10000
    expect(cache.scalePrice("BTCUSD", "50000.5")).toBe(500005000);
    expect(cache.scalePrice("BTCUSD", "100")).toBe(1000000);
  });

  it("scaleRatio multiplies by ratioScale (10^exponent) and rounds", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => MOCK_PRODUCTS_RESPONSE,
    });

    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    // BTCUSD ratioScale=10^8=100000000
    expect(cache.scaleRatio("BTCUSD", "10")).toBe(1000000000);
  });

  it("handles init failure gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init(); // should not throw

    expect(cache.isLoaded()).toBe(false);
    expect(cache.get("BTCUSD")).toBeUndefined();
  });

  it("convertResponse converts Ep fields to decimal strings", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    const converted = cache.convertResponse("BTCUSD", {
      priceEp: 500005000,
      avgPriceEp: 490000000,
      side: "Buy",
      orderQty: 100,
    });
    expect(converted).toEqual({
      price: "50000.5",
      avgPrice: "49000",
      side: "Buy",
      orderQty: 100,
    });
  });

  it("convertResponse handles nested objects and arrays", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    const converted = cache.convertResponse("BTCUSD", {
      orders: [
        { priceEp: 500000000, symbol: "BTCUSD" },
        { priceEp: 510000000, symbol: "BTCUSD" },
      ],
    });
    expect(converted).toEqual({
      orders: [
        { price: "50000", symbol: "BTCUSD" },
        { price: "51000", symbol: "BTCUSD" },
      ],
    });
  });

  it("convertResponse returns data unchanged for unknown symbol", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    const data = { priceEp: 500000000 };
    expect(cache.convertResponse("XYZUSD", data)).toEqual(data);
  });

  it("scaleCurrencyAmount converts decimal string to scaled integer using currency scale", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    // BTC valueScale=8, so 10^8=100000000
    expect(cache.scaleCurrencyAmount("BTC", "1.5")).toBe(150000000);
    expect(cache.scaleCurrencyAmount("BTC", "0.001")).toBe(100000);
    expect(cache.scaleCurrencyAmount("USDT", "100")).toBe(10000000000);
  });

  it("unscaleCurrencyAmount converts scaled integer back to decimal string", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    expect(cache.unscaleCurrencyAmount("BTC", 150000000)).toBe("1.5");
    expect(cache.unscaleCurrencyAmount("BTC", 100000)).toBe("0.001");
    expect(cache.unscaleCurrencyAmount("USDT", 10000000000)).toBe("100");
  });

  it("scaleCurrencyAmount throws for unknown currency", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    expect(() => cache.scaleCurrencyAmount("UNKNOWN", "1")).toThrow("No currency info for UNKNOWN");
  });

  it("caches spot products from products array with type=Spot", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    const sbtc = cache.get("sBTCUSDT");
    expect(sbtc).toBeDefined();
    expect(sbtc!.symbol).toBe("sBTCUSDT");
    expect(sbtc!.contractType).toBe("spot");
    expect(sbtc!.priceScale).toBe(100000000);   // 10^8
    expect(sbtc!.valueScale).toBe(100000000);    // from USDT currency valueScale=8
  });

  it("filters out delisted spot products", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    expect(cache.get("sDELISTED")).toBeUndefined();
  });

  it("scalePrice works for spot symbols", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    // sBTCUSDT priceScale=10^8
    expect(cache.scalePrice("sBTCUSDT", "95000.50")).toBe(9500050000000);
  });

  it("convertResponse works for spot symbols", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    const converted = cache.convertResponse("sBTCUSDT", {
      priceEp: 9500050000000,
      baseQtyEv: 1000000,
      side: "Buy",
    });
    expect(converted).toEqual({
      price: "95000.5",
      baseQty: "0.01",
      side: "Buy",
    });
  });

  it("convertResponse skips plain fields that have Ep/Er/Ev siblings", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => MOCK_PRODUCTS_RESPONSE });
    const cache = new ProductInfoCache("https://api.phemex.com");
    await cache.init();

    // Phemex API often returns both priceEp and price (null) — the null must not overwrite
    const converted = cache.convertResponse("BTCUSD", {
      priceEp: 500005000,
      price: null,
      cumValueEv: 1000000000,
      cumValue: null,
      closedPnlEv: -7847,
      closedPnl: null,
      ordType: "Market",
    });
    expect(converted).toEqual({
      price: "50000.5",
      cumValue: "10",
      closedPnl: "-0.00007847",
      ordType: "Market",
    });
  });
});
