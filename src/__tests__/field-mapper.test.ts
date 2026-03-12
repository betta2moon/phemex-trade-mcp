import { describe, it, expect } from "vitest";
import { mapFields, FIELD_MAP } from "../formatters/field-mapper.js";

describe("mapFields", () => {
  it("maps Rp fields to friendly names", () => {
    const input = { closeRp: "86.22", highRp: "90.00", lowRp: "85.00" };
    const result = mapFields(input) as Record<string, unknown>;
    expect(result).toEqual({ closePrice: "86.22", highPrice: "90.00", lowPrice: "85.00" });
  });

  it("maps Rv fields to friendly names", () => {
    const input = { accountBalanceRv: "1000.50", unRealisedPnlRv: "50.25" };
    const result = mapFields(input) as Record<string, unknown>;
    expect(result).toEqual({ accountBalance: "1000.50", unrealizedPnl: "50.25" });
  });

  it("maps Rr fields to friendly names", () => {
    const input = { fundingRateRr: "0.0001", leverageRr: "10" };
    const result = mapFields(input) as Record<string, unknown>;
    expect(result).toEqual({ fundingRate: "0.0001", leverage: "10" });
  });

  it("maps Rq fields to friendly names", () => {
    const input = { volumeRq: "688389.18", orderQtyRq: "0.01" };
    const result = mapFields(input) as Record<string, unknown>;
    expect(result).toEqual({ volume: "688389.18", orderQty: "0.01" });
  });

  it("preserves unmapped fields", () => {
    const input = { symbol: "BTCUSDT", closeRp: "86.22", status: "active" };
    const result = mapFields(input) as Record<string, unknown>;
    expect(result).toEqual({ symbol: "BTCUSDT", closePrice: "86.22", status: "active" });
  });

  it("handles nested objects", () => {
    const input = {
      account: {
        accountBalanceRv: "1000",
        positions: [
          { avgEntryPriceRp: "85000", unRealisedPnlRv: "50" },
        ],
      },
    };
    const result = mapFields(input) as any;
    expect(result.account.accountBalance).toBe("1000");
    expect(result.account.positions[0].avgEntryPrice).toBe("85000");
    expect(result.account.positions[0].unrealizedPnl).toBe("50");
  });

  it("handles arrays at top level", () => {
    const input = [
      { closeRp: "86.22" },
      { closeRp: "87.00" },
    ];
    const result = mapFields(input) as any[];
    expect(result[0].closePrice).toBe("86.22");
    expect(result[1].closePrice).toBe("87.00");
  });

  it("returns raw when useRaw is true", () => {
    const input = { closeRp: "86.22", volumeRq: "100" };
    const result = mapFields(input, true);
    expect(result).toBe(input); // Same reference, no mapping
  });

  it("handles null and primitive values", () => {
    expect(mapFields(null)).toBeNull();
    expect(mapFields(42)).toBe(42);
    expect(mapFields("hello")).toBe("hello");
    expect(mapFields(undefined)).toBeUndefined();
  });

  it("maps all documented field suffixes", () => {
    // Verify key mappings exist
    expect(FIELD_MAP.closeRp).toBe("closePrice");
    expect(FIELD_MAP.markPriceRp).toBe("markPrice");
    expect(FIELD_MAP.fundingRateRr).toBe("fundingRate");
    expect(FIELD_MAP.volumeRq).toBe("volume");
    expect(FIELD_MAP.accountBalanceRv).toBe("accountBalance");
  });

  it("does not have Rp/Rv/Rr/Rq suffixes in output keys", () => {
    const input = {
      closeRp: "86.22",
      markPriceRp: "86.22",
      fundingRateRr: "0.0001",
      volumeRq: "688389.18",
      accountBalanceRv: "1000",
    };
    const result = mapFields(input) as Record<string, unknown>;
    const keys = Object.keys(result);
    for (const key of keys) {
      expect(key).not.toMatch(/Rp$|Rv$|Rr$|Rq$/);
    }
  });
});
