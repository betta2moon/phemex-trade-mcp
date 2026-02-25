#!/usr/bin/env node
import "dotenv/config";
import crypto from "node:crypto";
import { PhemexClient } from "./client.js";
import { ProductInfoCache } from "./product-info.js";
import { ContractRouter } from "./contract-router.js";
import { parseCliArgs } from "./cli-parser.js";
import type { ContractType } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fail(message: string): never {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

function succeed(data: unknown): never {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

function getContractType(params: Record<string, unknown>): ContractType {
  const ct = (params.contractType as string) ?? "linear";
  if (ct !== "linear" && ct !== "inverse" && ct !== "spot") {
    fail(`Invalid contractType: ${ct}. Must be linear, inverse, or spot.`);
  }
  return ct;
}

function requireString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== "string" || v === "") fail(`Missing required parameter: --${key}`);
  return v as string;
}

function optString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function optNumber(params: Record<string, unknown>, key: string, defaultVal?: number): number | undefined {
  const v = params[key];
  if (v === undefined) return defaultVal;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); if (!isNaN(n)) return n; }
  fail(`Parameter --${key} must be a number`);
}

function requireNumber(params: Record<string, unknown>, key: string): number {
  const v = optNumber(params, key);
  if (v === undefined) fail(`Missing required parameter: --${key}`);
  return v as number;
}

function optBool(params: Record<string, unknown>, key: string, defaultVal = false): boolean {
  const v = params[key];
  if (v === undefined) return defaultVal;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return defaultVal;
}

// ── Tool type ────────────────────────────────────────────────────────────────

type ToolHandler = (params: Record<string, unknown>, client: PhemexClient, pc: ProductInfoCache) => Promise<void>;

// ── Market data handlers ─────────────────────────────────────────────────────

const handleGetTicker: ToolHandler = async (params, client) => {
  const symbol = requireString(params, "symbol");
  const ct = getContractType(params);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "ticker");
  const res = await client.getPublicMd<unknown>(endpoint, { symbol: resolved });
  if (res.error) fail(`${res.error.message} (code: ${res.error.code})`);
  succeed(res.result);
};

const handleGetOrderbook: ToolHandler = async (params, client) => {
  const symbol = requireString(params, "symbol");
  const ct = getContractType(params);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "orderbook");
  const res = await client.getPublicMd<unknown>(endpoint, { symbol: resolved, id: 0 });
  if (res.error) fail(`${res.error.message} (code: ${res.error.code})`);
  succeed(res.result);
};

const handleGetKlines: ToolHandler = async (params, client) => {
  const symbol = requireString(params, "symbol");
  const resolution = requireNumber(params, "resolution");
  const limit = optNumber(params, "limit", 100)!;
  const ct = getContractType(params);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const to = Math.floor(Date.now() / 1000);
  const from = to - resolution * limit;
  const endpoint = ContractRouter.getEndpoint(ct, "klines");
  const res = await client.getPublic<unknown>(endpoint, { symbol: resolved, resolution, limit, from, to });
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  succeed(res.data);
};

const handleGetRecentTrades: ToolHandler = async (params, client) => {
  const symbol = requireString(params, "symbol");
  const ct = getContractType(params);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "recentTrades");
  const res = await client.getPublicMd<unknown>(endpoint, { symbol: resolved });
  if (res.error) fail(`${res.error.message} (code: ${res.error.code})`);
  succeed(res.result);
};

const handleGetFundingRate: ToolHandler = async (params, client) => {
  const symbol = requireString(params, "symbol");
  const limit = optNumber(params, "limit", 20)!;
  const ct = getContractType(params);
  if (ContractRouter.isSpot(ct)) fail("Spot does not have funding rates.");
  const endpoint = ContractRouter.getEndpoint(ct, "fundingRate");
  const res = await client.getPublic<unknown>(endpoint, { symbol, limit });
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  succeed(res.data);
};

// ── Account handlers ─────────────────────────────────────────────────────────

const handleGetAccount: ToolHandler = async (params, client) => {
  const currency = (params.currency as string) ?? "USDT";
  const ct = getContractType(params);
  if (ContractRouter.isSpot(ct)) fail("Spot does not have a futures-style account. Use get_spot_wallet.");
  const endpoint = ContractRouter.getEndpoint(ct, "account");
  const res = await client.get<unknown>(endpoint, { currency });
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  succeed(res.data);
};

const handleGetSpotWallet: ToolHandler = async (params, client, pc) => {
  const res = await client.get<unknown>("/spot/wallets");
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  let data = res.data;
  if (Array.isArray(data) && pc.isLoaded()) {
    data = data.map((wallet: Record<string, unknown>) => {
      const display = { ...wallet };
      const currency = wallet.currency as string | undefined;
      if (!currency) return display;
      try {
        if (typeof wallet.balanceEv === "number") {
          display.balance = pc.unscaleCurrencyAmount(currency, wallet.balanceEv);
          delete display.balanceEv;
        }
        if (typeof wallet.lockedBalanceEv === "number") {
          display.lockedBalance = pc.unscaleCurrencyAmount(currency, wallet.lockedBalanceEv);
          delete display.lockedBalanceEv;
        }
        if (typeof wallet.lastUpdateTimeNs === "number") {
          display.lastUpdateTime = new Date(wallet.lastUpdateTimeNs / 1e6).toISOString();
          delete display.lastUpdateTimeNs;
        }
      } catch { /* keep Ev values as-is */ }
      return display;
    });
  }
  succeed(data);
};

const handleGetPositions: ToolHandler = async (params, client) => {
  const currency = (params.currency as string) ?? "USDT";
  const ct = getContractType(params);
  if (ContractRouter.isSpot(ct)) fail("Spot does not have positions.");
  const endpoint = ContractRouter.getEndpoint(ct, "positions");
  const res = await client.get<unknown>(endpoint, { currency });
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  succeed(res.data);
};

const handleGetOpenOrders: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const ct = getContractType(params);
  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "openOrders");
  const res = await client.get<unknown>(endpoint, { symbol: resolved });
  if (res.code !== 0) {
    if (res.msg === "OM_ORDER_NOT_FOUND") succeed({ message: `No open orders for ${symbol}.`, orders: [] });
    fail(client.getErrorMessage(res.code, res.msg));
  }
  const data = (ContractRouter.isInverse(ct) || ContractRouter.isSpot(ct)) ? pc.convertResponse(resolved, res.data) : res.data;
  succeed(data);
};

const handleGetOrderHistory: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const limit = optNumber(params, "limit", 50)!;
  const ct = getContractType(params);
  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "orderHistory");
  const res = await client.get<unknown>(endpoint, { symbol: resolved, limit });
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  const data = (ContractRouter.isInverse(ct) || ContractRouter.isSpot(ct)) ? pc.convertResponse(resolved, res.data) : res.data;
  succeed(data);
};

const handleGetTrades: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const limit = optNumber(params, "limit", 50)!;
  const ct = getContractType(params);
  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "tradeHistory");
  const res = await client.get<unknown>(endpoint, { symbol: resolved, limit });
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  const data = (ContractRouter.isInverse(ct) || ContractRouter.isSpot(ct)) ? pc.convertResponse(resolved, res.data) : res.data;
  succeed(data);
};

// ── Trading handlers ─────────────────────────────────────────────────────────

const handlePlaceOrder: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const side = requireString(params, "side") as "Buy" | "Sell";
  const orderQty = requireString(params, "orderQty");
  const ordType = requireString(params, "ordType") as "Market" | "Limit" | "Stop" | "StopLimit";
  const ct = getContractType(params);
  const price = optString(params, "price");
  const timeInForce = (params.timeInForce as string) ?? "GoodTillCancel";
  const posSide = (params.posSide as string) ?? "Merged";
  const stopPx = optString(params, "stopPx");
  const triggerType = optString(params, "triggerType");
  const reduceOnly = optBool(params, "reduceOnly");
  const takeProfit = optString(params, "takeProfit");
  const stopLoss = optString(params, "stopLoss");
  const qtyType = (params.qtyType as string) ?? "ByBase";

  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const clOrdID = "betta2moon" + crypto.randomUUID().replace(/-/g, "").slice(0, 30);
  const endpoint = ContractRouter.getEndpoint(ct, "placeOrder");

  let queryParams: Record<string, string | number | boolean>;

  if (ContractRouter.isInverse(ct)) {
    if (!pc.isLoaded()) fail("Product info not loaded. Coin-M requires product metadata.");
    queryParams = { symbol: resolved, clOrdID, side, orderQty: parseInt(orderQty), ordType, timeInForce };
    if (price !== undefined) queryParams.priceEp = pc.scalePrice(resolved, price);
    if (stopPx !== undefined) queryParams.stopPxEp = pc.scalePrice(resolved, stopPx);
    if (takeProfit !== undefined) queryParams.takeProfitEp = pc.scalePrice(resolved, takeProfit);
    if (stopLoss !== undefined) queryParams.stopLossEp = pc.scalePrice(resolved, stopLoss);
    if (posSide !== undefined) queryParams.posSide = posSide;
    if (triggerType !== undefined) queryParams.triggerType = triggerType;
    if (reduceOnly) queryParams.reduceOnly = true;
  } else if (ContractRouter.isSpot(ct)) {
    if (!pc.isLoaded()) fail("Product info not loaded. Spot requires product metadata.");
    queryParams = { symbol: resolved, clOrdID, side, ordType, timeInForce, qtyType };
    if (qtyType === "ByQuote") {
      queryParams.quoteQtyEv = pc.scaleValue(resolved, orderQty);
    } else {
      queryParams.baseQtyEv = pc.scaleValue(resolved, orderQty);
    }
    if (price !== undefined) queryParams.priceEp = pc.scalePrice(resolved, price);
    if (stopPx !== undefined) queryParams.stopPxEp = pc.scalePrice(resolved, stopPx);
    if (triggerType !== undefined) queryParams.triggerType = triggerType;
  } else {
    queryParams = { symbol: resolved, clOrdID, side, orderQtyRq: orderQty, ordType, timeInForce, posSide };
    if (price !== undefined) queryParams.priceRp = price;
    if (stopPx !== undefined) queryParams.stopPxRp = stopPx;
    if (takeProfit !== undefined) queryParams.takeProfitRp = takeProfit;
    if (stopLoss !== undefined) queryParams.stopLossRp = stopLoss;
    if (triggerType !== undefined) queryParams.triggerType = triggerType;
    if (reduceOnly) queryParams.reduceOnly = true;
  }

  const res = await client.putWithQuery<unknown>(endpoint, queryParams);
  if (res.code !== 0) fail(`Order FAILED: ${client.getErrorMessage(res.code, res.msg)}`);
  const data = (ContractRouter.isInverse(ct) || ContractRouter.isSpot(ct)) ? pc.convertResponse(resolved, res.data) : res.data;
  succeed(data);
};

const handleAmendOrder: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const ct = getContractType(params);
  const orderID = optString(params, "orderID");
  const origClOrdID = optString(params, "origClOrdID");
  const price = optString(params, "price");
  const orderQty = optString(params, "orderQty");
  const posSide = (params.posSide as string) ?? "Merged";

  if (!orderID && !origClOrdID) fail("Provide either --orderID or --origClOrdID");
  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "amendOrder");
  const qp: Record<string, string | number | boolean> = { symbol: resolved };
  if (orderID) qp.orderID = orderID;
  if (origClOrdID) qp.origClOrdID = origClOrdID;
  if (!ContractRouter.isInverse(ct) && !ContractRouter.isSpot(ct)) qp.posSide = posSide;

  if (ContractRouter.isInverse(ct) || ContractRouter.isSpot(ct)) {
    if (!pc.isLoaded()) fail("Product info not loaded.");
    if (price !== undefined) qp.priceEp = pc.scalePrice(resolved, price);
    if (orderQty !== undefined) {
      if (ContractRouter.isSpot(ct)) { qp.baseQtyEv = pc.scaleValue(resolved, orderQty); }
      else { qp.orderQty = parseInt(orderQty); }
    }
  } else {
    if (price !== undefined) qp.priceRp = price;
    if (orderQty !== undefined) qp.orderQtyRq = orderQty;
  }

  const res = await client.putWithQuery<unknown>(endpoint, qp);
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  const data = (ContractRouter.isInverse(ct) || ContractRouter.isSpot(ct)) ? pc.convertResponse(resolved, res.data) : res.data;
  succeed(data);
};

const handleCancelOrder: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const ct = getContractType(params);
  const orderID = optString(params, "orderID");
  const clOrdID = optString(params, "clOrdID");
  const posSide = (params.posSide as string) ?? "Merged";

  if (!orderID && !clOrdID) fail("Provide either --orderID or --clOrdID");
  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "cancelOrder");
  const qp: Record<string, string | number | boolean> = { symbol: resolved };
  if (orderID) qp.orderID = orderID;
  if (clOrdID) qp.clOrdID = clOrdID;
  if (!ContractRouter.isInverse(ct) && !ContractRouter.isSpot(ct)) qp.posSide = posSide;

  const res = await client.delete<unknown>(endpoint, qp);
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  const data = (ContractRouter.isInverse(ct) || ContractRouter.isSpot(ct)) ? pc.convertResponse(resolved, res.data) : res.data;
  succeed(data);
};

const handleCancelAllOrders: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const ct = getContractType(params);
  const untriggered = optBool(params, "untriggered");
  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const resolved = ContractRouter.resolveSymbol(ct, symbol);
  const endpoint = ContractRouter.getEndpoint(ct, "cancelAll");
  const qp: Record<string, string | number | boolean> = { symbol: resolved };
  if (untriggered) qp.untriggered = true;

  const res = await client.delete<unknown>(endpoint, qp);
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  const data = (ContractRouter.isInverse(ct) || ContractRouter.isSpot(ct)) ? pc.convertResponse(resolved, res.data) : res.data;
  succeed(data);
};

const handleSetLeverage: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const leverage = requireNumber(params, "leverage");
  const ct = getContractType(params);
  if (ContractRouter.isSpot(ct)) fail("Spot does not support leverage.");
  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const endpoint = ContractRouter.getEndpoint(ct, "setLeverage");
  const qp: Record<string, string | number | boolean> = { symbol };
  if (ContractRouter.isInverse(ct)) {
    if (!pc.isLoaded()) fail("Product info not loaded.");
    qp.leverageEr = pc.scaleRatio(symbol, String(leverage));
  } else {
    qp.leverageRr = leverage;
  }

  const res = await client.putWithQuery<unknown>(endpoint, qp);
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  const data = ContractRouter.isInverse(ct) ? pc.convertResponse(symbol, res.data) : res.data;
  succeed(data);
};

const handleSwitchPosMode: ToolHandler = async (params, client, pc) => {
  const symbol = requireString(params, "symbol");
  const targetPosMode = requireString(params, "targetPosMode") as "OneWay" | "Hedged";
  const ct = getContractType(params);
  if (ContractRouter.isSpot(ct)) fail("Spot does not have position modes.");
  if (ContractRouter.isInverse(ct)) fail("Position mode switching is not supported for Coin-M via API.");
  const symbolErr = ContractRouter.validateSymbol(ct, symbol);
  if (symbolErr) fail(symbolErr);
  const endpoint = ContractRouter.getEndpoint(ct, "switchPosMode");
  const res = await client.putWithQuery<unknown>(endpoint, { symbol, targetPosMode });
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  const data = ContractRouter.isInverse(ct) ? pc.convertResponse(symbol, res.data) : res.data;
  succeed(data);
};

// ── Transfer handlers ────────────────────────────────────────────────────────

const TRANSFER_STATUS: Record<number, string> = {
  3: "Rejected", 6: "Error (waiting for recovery)", 10: "Success", 11: "Failed",
};

const handleTransferFunds: ToolHandler = async (params, client, pc) => {
  const currency = requireString(params, "currency");
  const amount = requireString(params, "amount");
  const direction = requireString(params, "direction") as "spot_to_futures" | "futures_to_spot";
  if (!pc.isLoaded()) fail("Product info not loaded.");
  let amountEv: number;
  try { amountEv = pc.scaleCurrencyAmount(currency, amount); }
  catch { fail(`Unknown currency '${currency}'.`); return; }
  const moveOp = direction === "spot_to_futures" ? 2 : 1;
  const res = await client.post<unknown>("/assets/transfer", { amountEv, currency, moveOp });
  if (res.code !== 0) fail(`Transfer failed: ${client.getErrorMessage(res.code, res.msg)}`);
  const data = res.data as Record<string, unknown>;
  const display = { ...data };
  if (typeof data.amountEv === "number") {
    display.amount = pc.unscaleCurrencyAmount(currency, data.amountEv);
    delete display.amountEv;
  }
  if (typeof data.status === "number") display.statusText = TRANSFER_STATUS[data.status] ?? "Processing";
  succeed(display);
};

const handleGetTransferHistory: ToolHandler = async (params, client, pc) => {
  const currency = requireString(params, "currency");
  const direction = optString(params, "direction") as "spot_to_futures" | "futures_to_spot" | undefined;
  const limit = optNumber(params, "limit", 20)!;
  const res = await client.get<unknown>("/assets/transfer", { currency, limit });
  if (res.code !== 0) fail(client.getErrorMessage(res.code, res.msg));
  const resData = res.data as Record<string, unknown>;
  let rawRows: Record<string, unknown>[] = Array.isArray(resData?.rows) ? resData.rows : (Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : []);
  if (direction !== undefined) {
    const targetBizType = direction === "spot_to_futures" ? 10 : 11;
    rawRows = rawRows.filter(row => row.bizType === targetBizType);
  }
  const displayRows = rawRows.map((row: Record<string, unknown>) => {
    const display = { ...row };
    if (typeof row.amountEv === "number" && pc.isLoaded()) {
      try { display.amount = pc.unscaleCurrencyAmount(currency, row.amountEv); delete display.amountEv; }
      catch { /* keep Ev */ }
    }
    if (typeof row.bizType === "number") display.direction = row.bizType === 10 ? "spot_to_futures" : "futures_to_spot";
    if (typeof row.status === "number") display.statusText = TRANSFER_STATUS[row.status] ?? "Processing";
    return display;
  });
  succeed(displayRows);
};

// ── Dispatch table ───────────────────────────────────────────────────────────

const TOOLS: Record<string, ToolHandler> = {
  get_ticker: handleGetTicker,
  get_orderbook: handleGetOrderbook,
  get_klines: handleGetKlines,
  get_recent_trades: handleGetRecentTrades,
  get_funding_rate: handleGetFundingRate,
  get_account: handleGetAccount,
  get_spot_wallet: handleGetSpotWallet,
  get_positions: handleGetPositions,
  get_open_orders: handleGetOpenOrders,
  get_order_history: handleGetOrderHistory,
  get_trades: handleGetTrades,
  place_order: handlePlaceOrder,
  amend_order: handleAmendOrder,
  cancel_order: handleCancelOrder,
  cancel_all_orders: handleCancelAllOrders,
  set_leverage: handleSetLeverage,
  switch_pos_mode: handleSwitchPosMode,
  transfer_funds: handleTransferFunds,
  get_transfer_history: handleGetTransferHistory,
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const toolName = process.argv[2];

  if (!toolName || toolName === "--help" || toolName === "-h") {
    console.log("Usage: phemex-cli <tool_name> [--flag value ...] | ['{json}']");
    console.log("\nAvailable tools:");
    for (const name of Object.keys(TOOLS)) {
      console.log(`  ${name}`);
    }
    process.exit(0);
  }

  const handler = TOOLS[toolName];
  if (!handler) {
    fail(`Unknown tool: ${toolName}. Run phemex-cli --help for available tools.`);
  }

  const args = process.argv.slice(3);
  const params = parseCliArgs(args);

  const apiKey = process.env.PHEMEX_API_KEY ?? "";
  const apiSecret = process.env.PHEMEX_API_SECRET ?? "";
  const baseUrl = process.env.PHEMEX_API_URL ?? "https://testnet-api.phemex.com";
  const maxOrderValue = process.env.PHEMEX_MAX_ORDER_VALUE ? Number(process.env.PHEMEX_MAX_ORDER_VALUE) : undefined;

  const client = new PhemexClient({ apiKey, apiSecret, baseUrl, maxOrderValue });
  const productCache = new ProductInfoCache(baseUrl);
  await productCache.init();

  await handler(params, client, productCache);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
