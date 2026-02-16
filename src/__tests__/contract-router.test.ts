import { describe, it, expect } from "vitest";
import { ContractRouter } from "../contract-router.js";

describe("ContractRouter", () => {
  describe("getEndpoint", () => {
    it("returns g-prefixed endpoints for linear", () => {
      expect(ContractRouter.getEndpoint("linear", "placeOrder")).toBe("/g-orders/create");
      expect(ContractRouter.getEndpoint("linear", "cancelOrder")).toBe("/g-orders/cancel");
      expect(ContractRouter.getEndpoint("linear", "amendOrder")).toBe("/g-orders/replace");
      expect(ContractRouter.getEndpoint("linear", "cancelAll")).toBe("/g-orders/all");
      expect(ContractRouter.getEndpoint("linear", "setLeverage")).toBe("/g-positions/leverage");
      expect(ContractRouter.getEndpoint("linear", "switchPosMode")).toBe("/g-positions/switch-pos-mode-sync");
      expect(ContractRouter.getEndpoint("linear", "account")).toBe("/g-accounts/accountPositions");
      expect(ContractRouter.getEndpoint("linear", "positions")).toBe("/g-accounts/positions");
      expect(ContractRouter.getEndpoint("linear", "openOrders")).toBe("/g-orders/activeList");
      expect(ContractRouter.getEndpoint("linear", "orderHistory")).toBe("/api-data/g-futures/orders");
      expect(ContractRouter.getEndpoint("linear", "tradeHistory")).toBe("/api-data/g-futures/trades");
    });

    it("returns non-g endpoints for inverse", () => {
      expect(ContractRouter.getEndpoint("inverse", "placeOrder")).toBe("/orders/create");
      expect(ContractRouter.getEndpoint("inverse", "cancelOrder")).toBe("/orders/cancel");
      expect(ContractRouter.getEndpoint("inverse", "amendOrder")).toBe("/orders/replace");
      expect(ContractRouter.getEndpoint("inverse", "cancelAll")).toBe("/orders/all");
      expect(ContractRouter.getEndpoint("inverse", "setLeverage")).toBe("/positions/leverage");
      expect(ContractRouter.getEndpoint("inverse", "switchPosMode")).toBe("/positions/switch-pos-mode-sync");
      expect(ContractRouter.getEndpoint("inverse", "account")).toBe("/accounts/accountPositions");
      expect(ContractRouter.getEndpoint("inverse", "positions")).toBe("/accounts/positions");
      expect(ContractRouter.getEndpoint("inverse", "openOrders")).toBe("/orders/activeList");
      expect(ContractRouter.getEndpoint("inverse", "orderHistory")).toBe("/exchange/order/list");
      expect(ContractRouter.getEndpoint("inverse", "tradeHistory")).toBe("/exchange/order/trade");
    });

    it("returns correct market data endpoints for linear", () => {
      expect(ContractRouter.getEndpoint("linear", "ticker")).toBe("/md/v2/ticker/24hr");
      expect(ContractRouter.getEndpoint("linear", "orderbook")).toBe("/md/v2/orderbook");
      expect(ContractRouter.getEndpoint("linear", "klines")).toBe("/exchange/public/md/v2/kline/list");
      expect(ContractRouter.getEndpoint("linear", "recentTrades")).toBe("/md/v2/trade");
      expect(ContractRouter.getEndpoint("linear", "fundingRate")).toBe("/api-data/public/data/funding-rate-history");
    });

    it("returns correct market data endpoints for inverse", () => {
      expect(ContractRouter.getEndpoint("inverse", "ticker")).toBe("/md/v1/ticker/24hr");
      expect(ContractRouter.getEndpoint("inverse", "orderbook")).toBe("/md/orderbook");
      expect(ContractRouter.getEndpoint("inverse", "klines")).toBe("/exchange/public/md/v2/kline");
      expect(ContractRouter.getEndpoint("inverse", "recentTrades")).toBe("/md/trade");
      expect(ContractRouter.getEndpoint("inverse", "fundingRate")).toBe("/api-data/public/data/funding-rate-history");
    });
  });

  describe("getEndpoint (spot)", () => {
    it("returns spot order endpoints", () => {
      expect(ContractRouter.getEndpoint("spot", "placeOrder")).toBe("/spot/orders/create");
      expect(ContractRouter.getEndpoint("spot", "cancelOrder")).toBe("/spot/orders");
      expect(ContractRouter.getEndpoint("spot", "amendOrder")).toBe("/spot/orders");
      expect(ContractRouter.getEndpoint("spot", "cancelAll")).toBe("/spot/orders/all");
      expect(ContractRouter.getEndpoint("spot", "openOrders")).toBe("/spot/orders");
      expect(ContractRouter.getEndpoint("spot", "orderHistory")).toBe("/api-data/spots/orders");
      expect(ContractRouter.getEndpoint("spot", "tradeHistory")).toBe("/api-data/spots/trades");
    });

    it("returns spot market data endpoints", () => {
      expect(ContractRouter.getEndpoint("spot", "ticker")).toBe("/md/spot/ticker/24hr");
      expect(ContractRouter.getEndpoint("spot", "orderbook")).toBe("/md/orderbook");
      expect(ContractRouter.getEndpoint("spot", "klines")).toBe("/exchange/public/md/v2/kline/list");
      expect(ContractRouter.getEndpoint("spot", "recentTrades")).toBe("/md/trade");
    });
  });

  describe("resolveSymbol", () => {
    it("prepends s for spot when missing", () => {
      expect(ContractRouter.resolveSymbol("spot", "BTCUSDT")).toBe("sBTCUSDT");
      expect(ContractRouter.resolveSymbol("spot", "ETHUSDT")).toBe("sETHUSDT");
    });

    it("passes through if spot symbol already has s prefix", () => {
      expect(ContractRouter.resolveSymbol("spot", "sBTCUSDT")).toBe("sBTCUSDT");
    });

    it("passes through unchanged for linear and inverse", () => {
      expect(ContractRouter.resolveSymbol("linear", "BTCUSDT")).toBe("BTCUSDT");
      expect(ContractRouter.resolveSymbol("inverse", "BTCUSD")).toBe("BTCUSD");
    });
  });

  describe("validateSymbol", () => {
    it("accepts BTCUSD for inverse", () => {
      expect(ContractRouter.validateSymbol("inverse", "BTCUSD")).toBeNull();
      expect(ContractRouter.validateSymbol("inverse", "ETHUSD")).toBeNull();
    });

    it("accepts BTCUSDT for linear", () => {
      expect(ContractRouter.validateSymbol("linear", "BTCUSDT")).toBeNull();
      expect(ContractRouter.validateSymbol("linear", "ETHUSDT")).toBeNull();
    });

    it("rejects USDT symbol for inverse", () => {
      const err = ContractRouter.validateSymbol("inverse", "BTCUSDT");
      expect(err).toContain("linear");
    });

    it("rejects USD-only symbol for linear", () => {
      const err = ContractRouter.validateSymbol("linear", "BTCUSD");
      expect(err).toContain("inverse");
    });
  });

  describe("validateSymbol (spot)", () => {
    it("accepts BTCUSDT for spot", () => {
      expect(ContractRouter.validateSymbol("spot", "BTCUSDT")).toBeNull();
      expect(ContractRouter.validateSymbol("spot", "sBTCUSDT")).toBeNull();
    });

    it("rejects Coin-M symbols for spot", () => {
      const err = ContractRouter.validateSymbol("spot", "BTCUSD");
      expect(err).toContain("Coin-M");
    });
  });

  describe("isInverse", () => {
    it("returns true for inverse", () => {
      expect(ContractRouter.isInverse("inverse")).toBe(true);
    });
    it("returns false for linear", () => {
      expect(ContractRouter.isInverse("linear")).toBe(false);
    });
  });

  describe("isSpot", () => {
    it("returns true for spot", () => {
      expect(ContractRouter.isSpot("spot")).toBe(true);
    });
    it("returns false for linear and inverse", () => {
      expect(ContractRouter.isSpot("linear")).toBe(false);
      expect(ContractRouter.isSpot("inverse")).toBe(false);
    });
  });
});
