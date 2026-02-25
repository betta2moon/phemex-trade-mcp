import { describe, it, expect } from "vitest";
import { parseCliArgs } from "../cli-parser.js";
import { requireString, optString, optNumber, requireNumber, optBool } from "../param-helpers.js";

/**
 * Regression tests for integer CLI values.
 *
 * parseCliArgs coerces integer strings to numbers (e.g. "--price 100000" → number 100000).
 * The param helpers must accept both string AND number types, otherwise numeric
 * values for price, orderQty, stopPx, etc. are silently dropped or rejected.
 */

describe("param helpers handle parseCliArgs integer coercion", () => {
  // ── requireString ─────────────────────────────────────────────────────────

  describe("requireString", () => {
    it("returns string when value is a string", () => {
      expect(requireString({ price: "100000.50" }, "price")).toBe("100000.50");
    });

    it("coerces number to string (regression: --orderQty 10)", () => {
      const params = parseCliArgs(["--orderQty", "10"]);
      // parseCliArgs coerces "10" to number 10
      expect(typeof params.orderQty).toBe("number");
      // requireString must still return "10"
      expect(requireString(params, "orderQty")).toBe("10");
    });

    it("coerces number to string (regression: --amount 500)", () => {
      const params = parseCliArgs(["--amount", "500"]);
      expect(typeof params.amount).toBe("number");
      expect(requireString(params, "amount")).toBe("500");
    });

    it("throws on missing key", () => {
      expect(() => requireString({}, "price")).toThrow("Missing required parameter: --price");
    });

    it("throws on empty string", () => {
      expect(() => requireString({ price: "" }, "price")).toThrow("Missing required parameter: --price");
    });
  });

  // ── optString ─────────────────────────────────────────────────────────────

  describe("optString", () => {
    it("returns string when value is a string", () => {
      expect(optString({ price: "95000.50" }, "price")).toBe("95000.50");
    });

    it("coerces number to string (regression: --price 100000)", () => {
      const params = parseCliArgs(["--price", "100000"]);
      // parseCliArgs coerces "100000" to number
      expect(typeof params.price).toBe("number");
      // optString must return "100000", not undefined
      expect(optString(params, "price")).toBe("100000");
    });

    it("coerces number to string (regression: --stopPx 95000)", () => {
      const params = parseCliArgs(["--stopPx", "95000"]);
      expect(optString(params, "stopPx")).toBe("95000");
    });

    it("coerces number to string (regression: --takeProfit 110000)", () => {
      const params = parseCliArgs(["--takeProfit", "110000"]);
      expect(optString(params, "takeProfit")).toBe("110000");
    });

    it("coerces number to string (regression: --stopLoss 90000)", () => {
      const params = parseCliArgs(["--stopLoss", "90000"]);
      expect(optString(params, "stopLoss")).toBe("90000");
    });

    it("returns undefined for missing key", () => {
      expect(optString({}, "price")).toBeUndefined();
    });

    it("returns undefined for non-string non-number value", () => {
      expect(optString({ flag: true }, "flag")).toBeUndefined();
    });

    it("preserves decimal strings as-is", () => {
      const params = parseCliArgs(["--price", "95000.50"]);
      expect(optString(params, "price")).toBe("95000.50");
    });
  });

  // ── end-to-end: place_order typical args ──────────────────────────────────

  describe("end-to-end: place_order CLI args", () => {
    it("handles all-integer numeric params", () => {
      const params = parseCliArgs([
        "--symbol", "BTCUSDT",
        "--side", "Sell",
        "--orderQty", "10",
        "--ordType", "Limit",
        "--price", "100000",
        "--stopLoss", "90000",
        "--takeProfit", "110000",
      ]);

      expect(requireString(params, "symbol")).toBe("BTCUSDT");
      expect(requireString(params, "side")).toBe("Sell");
      expect(requireString(params, "orderQty")).toBe("10");
      expect(requireString(params, "ordType")).toBe("Limit");
      expect(optString(params, "price")).toBe("100000");
      expect(optString(params, "stopLoss")).toBe("90000");
      expect(optString(params, "takeProfit")).toBe("110000");
    });

    it("handles mixed integer and decimal params", () => {
      const params = parseCliArgs([
        "--symbol", "BTCUSDT",
        "--side", "Buy",
        "--orderQty", "0.5",
        "--ordType", "Limit",
        "--price", "100000",
      ]);

      expect(requireString(params, "orderQty")).toBe("0.5");
      expect(optString(params, "price")).toBe("100000");
    });
  });

  // ── amend_order typical args ──────────────────────────────────────────────

  describe("end-to-end: amend_order CLI args", () => {
    it("handles integer price and orderQty for amend", () => {
      const params = parseCliArgs([
        "--symbol", "BTCUSDT",
        "--orderID", "abc-123",
        "--price", "99000",
        "--orderQty", "5",
      ]);

      expect(optString(params, "price")).toBe("99000");
      expect(optString(params, "orderQty")).toBe("5");
    });
  });

  // ── transfer_funds typical args ───────────────────────────────────────────

  describe("end-to-end: transfer_funds CLI args", () => {
    it("handles integer amount", () => {
      const params = parseCliArgs([
        "--currency", "USDT",
        "--amount", "100",
        "--direction", "spot_to_futures",
      ]);

      expect(requireString(params, "amount")).toBe("100");
    });
  });

  // ── optNumber / requireNumber (should still work) ─────────────────────────

  describe("optNumber", () => {
    it("returns number from coerced integer", () => {
      const params = parseCliArgs(["--limit", "50"]);
      expect(optNumber(params, "limit")).toBe(50);
    });

    it("returns number from decimal string", () => {
      expect(optNumber({ leverage: "2.5" }, "leverage")).toBe(2.5);
    });

    it("returns default when missing", () => {
      expect(optNumber({}, "limit", 100)).toBe(100);
    });

    it("throws on non-numeric string", () => {
      expect(() => optNumber({ x: "abc" }, "x")).toThrow("must be a number");
    });
  });

  describe("requireNumber", () => {
    it("returns number from coerced integer", () => {
      const params = parseCliArgs(["--leverage", "10"]);
      expect(requireNumber(params, "leverage")).toBe(10);
    });

    it("throws on missing key", () => {
      expect(() => requireNumber({}, "leverage")).toThrow("Missing required parameter");
    });
  });

  // ── optBool ───────────────────────────────────────────────────────────────

  describe("optBool", () => {
    it("returns true for coerced boolean", () => {
      const params = parseCliArgs(["--reduceOnly", "true"]);
      expect(optBool(params, "reduceOnly")).toBe(true);
    });

    it("returns true for flag with no value", () => {
      const params = parseCliArgs(["--reduceOnly"]);
      expect(optBool(params, "reduceOnly")).toBe(true);
    });

    it("returns default when missing", () => {
      expect(optBool({}, "reduceOnly")).toBe(false);
    });
  });
});
