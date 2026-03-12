import { describe, it, expect } from "vitest";
import { enhanceError } from "../errors.js";

describe("enhanceError", () => {
  it("enhances invalid symbol with USDT suggestion", () => {
    const result = enhanceError({ code: 6001, message: "bad" }, { symbol: "BTCUSD" });
    expect(result.code).toBe(6001);
    expect(result.suggestion).toContain("BTCUSDT");
    expect(result.tip).toContain("list_symbols");
  });

  it("returns generic message for 6001 without symbol hint", () => {
    const result = enhanceError({ code: 6001 }, {});
    expect(result.code).toBe(6001);
    expect(result.error).toBe("Invalid argument");
  });

  it("enhances API key error (10003)", () => {
    const result = enhanceError({ code: 10003 }, {});
    expect(result.code).toBe(10003);
    expect(result.suggestion).toContain("PHEMEX_API_KEY");
    expect(result.docs).toBeDefined();
  });

  it("enhances insufficient balance (11001)", () => {
    const result = enhanceError({ code: 11001 }, { currency: "BTC" });
    expect(result.suggestion).toContain("BTC");
    expect(result.tip).toContain("get_account");
  });

  it("enhances order not found (39996)", () => {
    const result = enhanceError({ code: 39996 }, { orderID: "abc123", symbol: "ETHUSDT" });
    expect(result.error).toContain("abc123");
    expect(result.tip).toContain("ETHUSDT");
  });

  it("enhances missing parameter (10500) with tool name", () => {
    const result = enhanceError({ code: 10500, message: "Missing param" }, { _tool: "place_order" });
    expect(result.suggestion).toContain("place_order --help");
  });

  it("enhances rate limit (10002)", () => {
    const result = enhanceError({ code: 10002 }, {});
    expect(result.suggestion).toContain("rate limited");
  });

  it("enhances invalid leverage (11074)", () => {
    const result = enhanceError({ code: 11074 }, {});
    expect(result.suggestion).toContain("out of range");
  });

  it("enhances position mode error (20004)", () => {
    const result = enhanceError({ code: 20004 }, {});
    expect(result.suggestion).toContain("posSide");
  });

  it("handles network errors", () => {
    const result = enhanceError({ message: "fetch failed" }, {});
    expect(result.code).toBe("NETWORK_ERROR");
    expect(result.suggestion).toContain("internet");
  });

  it("handles ECONNREFUSED", () => {
    const result = enhanceError({ message: "ECONNREFUSED" }, {});
    expect(result.code).toBe("NETWORK_ERROR");
  });

  it("returns generic error for unknown codes", () => {
    const result = enhanceError({ code: 99999, message: "something weird" }, {});
    expect(result.code).toBe(99999);
    expect(result.error).toBe("something weird");
    expect(result.suggestion).toBeUndefined();
  });

  it("handles error without code", () => {
    const result = enhanceError({ message: "generic error" }, {});
    expect(result.code).toBe("UNKNOWN");
    expect(result.error).toBe("generic error");
  });
});
