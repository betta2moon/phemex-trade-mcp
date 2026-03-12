import { describe, it, expect } from "vitest";
import { TOOL_SCHEMAS, formatHelp } from "../tool-schemas.js";

describe("TOOL_SCHEMAS", () => {
  const expectedTools = [
    "get_ticker", "get_orderbook", "get_klines", "get_recent_trades", "get_funding_rate",
    "get_account", "get_spot_wallet", "get_positions", "get_open_orders",
    "get_order_history", "get_trades",
    "place_order", "amend_order", "cancel_order", "cancel_all_orders",
    "set_leverage", "switch_pos_mode",
    "transfer_funds", "get_transfer_history",
    "list_symbols",
  ];

  it("has schemas for all tools", () => {
    for (const tool of expectedTools) {
      expect(TOOL_SCHEMAS[tool], `missing schema for ${tool}`).toBeDefined();
    }
  });

  it("every schema has name, description, params, and examples", () => {
    for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
      expect(schema.name).toBe(name);
      expect(schema.description).toBeTruthy();
      expect(schema.params).toBeDefined();
      expect(schema.examples.length).toBeGreaterThan(0);
    }
  });

  it("place_order has all required params", () => {
    const schema = TOOL_SCHEMAS.place_order;
    const required = Object.entries(schema.params)
      .filter(([, p]) => p.required)
      .map(([k]) => k);
    expect(required).toContain("symbol");
    expect(required).toContain("side");
    expect(required).toContain("orderQty");
    expect(required).toContain("ordType");
  });
});

describe("formatHelp", () => {
  it("includes Usage line", () => {
    const help = formatHelp(TOOL_SCHEMAS.get_ticker);
    expect(help).toContain("Usage: phemex-cli get_ticker [options]");
  });

  it("includes description", () => {
    const help = formatHelp(TOOL_SCHEMAS.get_ticker);
    expect(help).toContain("24hr price ticker");
  });

  it("shows Required Parameters section", () => {
    const help = formatHelp(TOOL_SCHEMAS.place_order);
    expect(help).toContain("Required Parameters:");
    expect(help).toContain("--symbol");
    expect(help).toContain("--side");
  });

  it("shows Optional Parameters with defaults", () => {
    const help = formatHelp(TOOL_SCHEMAS.place_order);
    expect(help).toContain("Optional Parameters:");
    expect(help).toContain("[default: GoodTillCancel]");
  });

  it("shows Examples section", () => {
    const help = formatHelp(TOOL_SCHEMAS.place_order);
    expect(help).toContain("Examples:");
    expect(help).toContain("phemex-cli place_order");
  });

  it("handles tool with no required params", () => {
    const help = formatHelp(TOOL_SCHEMAS.get_spot_wallet);
    expect(help).not.toContain("Required Parameters:");
  });
});
