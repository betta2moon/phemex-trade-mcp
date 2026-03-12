import { describe, it, expect } from "vitest";
import { enhanceError } from "../errors.js";

describe("enhanceError", () => {
  // ── Numeric code lookups ───────────────────────────────────────────────────

  it("enhances invalid symbol with USDT suggestion (6001 + USD suffix)", () => {
    const result = enhanceError({ code: 6001, message: "bad" }, { symbol: "BTCUSD" });
    expect(result.code).toBe(6001);
    expect(result.suggestion).toContain("BTCUSDT");
    expect(result.tip).toContain("list_symbols");
  });

  it("enhances 6001 with generic symbol message when symbol doesn't end in USD", () => {
    const result = enhanceError({ code: 6001, msg: "invalid argument" }, { symbol: "INVALIDXXX" });
    expect(result.code).toBe(6001);
    expect(result.error).toContain("INVALIDXXX");
    expect(result.suggestion).toContain("not recognized");
    expect(result.tip).toContain("list_symbols");
  });

  it("enhances 6001 without symbol — shows help suggestion", () => {
    const result = enhanceError({ code: 6001 }, { _tool: "get_ticker" });
    expect(result.code).toBe(6001);
    expect(result.suggestion).toContain("get_ticker --help");
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

  // ── String msg-based lookups (TE_ codes) ───────────────────────────────────

  it("enhances TE_QTY_TOO_LARGE via msg lookup", () => {
    const result = enhanceError(
      { code: 10001, msg: "TE_QTY_TOO_LARGE" },
      { symbol: "BTCUSDT" },
    );
    expect(result.code).toBe("TE_QTY_TOO_LARGE");
    expect(result.error).toContain("quantity too large");
    expect(result.suggestion).toContain("BTCUSDT");
    expect(result.tip).toContain("orderQty");
  });

  it("enhances TE_QTY_TOO_SMALL via msg lookup", () => {
    const result = enhanceError(
      { code: 10001, msg: "TE_QTY_TOO_SMALL" },
      { symbol: "ETHUSDT" },
    );
    expect(result.code).toBe("TE_QTY_TOO_SMALL");
    expect(result.error).toContain("quantity too small");
  });

  it("enhances TE_NO_ENOUGH_AVAILABLE_BALANCE via msg lookup", () => {
    const result = enhanceError(
      { code: 10001, msg: "TE_NO_ENOUGH_AVAILABLE_BALANCE" },
      { currency: "USDT" },
    );
    expect(result.code).toBe("TE_NO_ENOUGH_AVAILABLE_BALANCE");
    expect(result.suggestion).toContain("USDT");
    expect(result.tip).toContain("get_account");
  });

  it("enhances TE_SYMBOL_INVALID via msg lookup", () => {
    const result = enhanceError(
      { code: 10001, msg: "TE_SYMBOL_INVALID" },
      { symbol: "FOOBAR" },
    );
    expect(result.code).toBe("TE_SYMBOL_INVALID");
    expect(result.error).toContain("FOOBAR");
    expect(result.tip).toContain("list_symbols");
  });

  it("enhances OM_ORDER_NOT_FOUND via msg lookup", () => {
    const result = enhanceError(
      { code: 39996, msg: "OM_ORDER_NOT_FOUND" },
      { symbol: "BTCUSDT" },
    );
    // msg-based lookup takes priority — both give similar results
    expect(result.code).toBe("OM_ORDER_NOT_FOUND");
    expect(result.suggestion).toContain("filled or cancelled");
  });

  it("enhances TE_PRICE_TOO_HIGH via msg lookup", () => {
    const result = enhanceError(
      { code: 10001, msg: "TE_PRICE_TOO_HIGH" },
      { symbol: "BTCUSDT" },
    );
    expect(result.code).toBe("TE_PRICE_TOO_HIGH");
    expect(result.error).toContain("price too high");
  });

  it("enhances TE_REDUCE_ONLY_REJECT via msg lookup", () => {
    const result = enhanceError(
      { code: 10001, msg: "TE_REDUCE_ONLY_REJECT" },
      {},
    );
    expect(result.code).toBe("TE_REDUCE_ONLY_REJECT");
    expect(result.suggestion).toContain("reduce-only");
  });

  // ── Numeric code takes priority over msg when code is known ────────────────

  it("prefers msg-based lookup (more specific) over numeric code", () => {
    // code 10001 maps to generic "Illegal request"
    // msg TE_QTY_TOO_LARGE is more specific — should take priority
    const result = enhanceError(
      { code: 10001, msg: "TE_QTY_TOO_LARGE" },
      { symbol: "BTCUSDT" },
    );
    expect(result.code).toBe("TE_QTY_TOO_LARGE");
    expect(result.error).toContain("quantity too large");
  });

  it("falls back to numeric code when msg is not a known key", () => {
    const result = enhanceError(
      { code: 11001, msg: "some random message" },
      { currency: "BTC" },
    );
    expect(result.code).toBe(11001);
    expect(result.error).toContain("Insufficient");
  });

  // ── Network errors ─────────────────────────────────────────────────────────

  it("handles network errors (fetch failed)", () => {
    const result = enhanceError({ message: "fetch failed" }, {});
    expect(result.code).toBe("NETWORK_ERROR");
    expect(result.suggestion).toContain("internet");
  });

  it("handles ECONNREFUSED", () => {
    const result = enhanceError({ message: "ECONNREFUSED" }, {});
    expect(result.code).toBe("NETWORK_ERROR");
  });

  // ── Fallbacks ──────────────────────────────────────────────────────────────

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

  it("uses msg field when message is absent", () => {
    const result = enhanceError({ msg: "some msg" }, {});
    expect(result.error).toBe("some msg");
  });
});
