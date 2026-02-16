import { describe, it, expect } from "vitest";
import { parseCliArgs } from "../cli-parser.js";

describe("parseCliArgs", () => {
  it("parses flag-style args", () => {
    const result = parseCliArgs(["--symbol", "BTCUSDT", "--contractType", "linear"]);
    expect(result).toEqual({ symbol: "BTCUSDT", contractType: "linear" });
  });

  it("parses JSON-style arg", () => {
    const result = parseCliArgs(['{"symbol":"BTCUSDT","contractType":"linear"}']);
    expect(result).toEqual({ symbol: "BTCUSDT", contractType: "linear" });
  });

  it("coerces numeric strings in flag mode", () => {
    const result = parseCliArgs(["--limit", "50", "--leverage", "10"]);
    expect(result).toEqual({ limit: 50, leverage: 10 });
  });

  it("coerces booleans in flag mode", () => {
    const result = parseCliArgs(["--reduceOnly", "true", "--untriggered", "false"]);
    expect(result).toEqual({ reduceOnly: true, untriggered: false });
  });

  it("returns empty object for no args", () => {
    const result = parseCliArgs([]);
    expect(result).toEqual({});
  });

  it("handles decimal string values (not coerced to number)", () => {
    const result = parseCliArgs(["--orderQty", "0.01", "--price", "95000.50"]);
    expect(result).toEqual({ orderQty: "0.01", price: "95000.50" });
  });

  it("handles flag with no value as true", () => {
    const result = parseCliArgs(["--reduceOnly"]);
    expect(result).toEqual({ reduceOnly: true });
  });
});
