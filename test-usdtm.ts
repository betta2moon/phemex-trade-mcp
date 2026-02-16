import "dotenv/config";
import { PhemexClient } from "./src/client.js";
import { ProductInfoCache } from "./src/product-info.js";
import { ContractRouter } from "./src/contract-router.js";

const client = new PhemexClient({
  apiKey: process.env.PHEMEX_API_KEY ?? "",
  apiSecret: process.env.PHEMEX_API_SECRET ?? "",
  baseUrl: process.env.PHEMEX_API_URL ?? "https://api.phemex.com",
});

const productCache = new ProductInfoCache(process.env.PHEMEX_API_URL ?? "https://api.phemex.com");

const SYMBOL = "BTCUSDT";
const CT: "linear" = "linear";

let passed = 0;
let failed = 0;

function log(label: string, data: unknown) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("=".repeat(60));
  if (typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`);
  }
}

async function main() {
  await productCache.init();
  check("ProductInfoCache init", productCache.isLoaded());

  const btcInfo = productCache.get(SYMBOL);
  check("BTCUSDT in product cache", btcInfo !== undefined);
  check("BTCUSDT is linear", btcInfo?.contractType === "linear");

  // Verify endpoints haven't changed for linear
  check("placeOrder endpoint", ContractRouter.getEndpoint(CT, "placeOrder") === "/g-orders/create");
  check("account endpoint", ContractRouter.getEndpoint(CT, "account") === "/g-accounts/accountPositions");
  check("ticker endpoint", ContractRouter.getEndpoint(CT, "ticker") === "/md/v2/ticker/24hr");

  // ============================================================
  //  ENSURE ACCOUNT IS IN OneWay MODE FIRST
  // ============================================================
  const spmEndpoint = ContractRouter.getEndpoint(CT, "switchPosMode");
  const spmSetup = await client.putWithQuery<any>(spmEndpoint, { symbol: SYMBOL, targetPosMode: "OneWay" });
  // If it's already OneWay, it may return an error — that's fine
  console.log(`  Setup: switch_pos_mode → OneWay: code=${spmSetup.code}, msg=${spmSetup.msg}`);

  // ============================================================
  //  MARKET DATA TOOLS (5)
  // ============================================================

  // 1. get_ticker
  const tickerEndpoint = ContractRouter.getEndpoint(CT, "ticker");
  const ticker = await client.getPublicMd<any>(tickerEndpoint, { symbol: SYMBOL });
  log("1. get_ticker (raw keys)", ticker.error ? ticker.error : Object.keys(ticker.result || {}));
  check("1. get_ticker", !ticker.error && ticker.result?.symbol === SYMBOL,
    ticker.error ? JSON.stringify(ticker.error) : undefined);
  // USDT-M v2 ticker uses open/high/low/close/lastPrice — check what fields exist
  const tickerKeys = Object.keys(ticker.result || {});
  check("   ticker has data", tickerKeys.length > 5, `keys: ${tickerKeys.join(",")}`);

  // 2. get_orderbook
  const obEndpoint = ContractRouter.getEndpoint(CT, "orderbook");
  const ob = await client.getPublicMd<any>(obEndpoint, { symbol: SYMBOL });
  log("2. get_orderbook (raw structure)", ob.error ? ob.error : {
    keys: Object.keys(ob.result || {}),
    bookKeys: Object.keys(ob.result?.book || {}),
    bids: ob.result?.book?.bids?.slice(0, 2) ?? ob.result?.bids?.slice(0, 2),
    asks: ob.result?.book?.asks?.slice(0, 2) ?? ob.result?.asks?.slice(0, 2),
  });
  // USDT-M v2 uses orderbook_p (not book)
  const obData = ob.result?.orderbook_p ?? ob.result?.book;
  const hasBook = obData?.bids?.length > 0 || obData?.asks?.length > 0;
  check("2. get_orderbook", !ob.error && hasBook,
    ob.error ? JSON.stringify(ob.error) : `keys: ${Object.keys(ob.result || {})}`);

  // 3. get_klines
  const klEndpoint = ContractRouter.getEndpoint(CT, "klines");
  const to = Math.floor(Date.now() / 1000);
  const from = to - 3600 * 5;
  const kl = await client.getPublic<any>(klEndpoint, { symbol: SYMBOL, resolution: 3600, limit: 5, from, to });
  check("3. get_klines", kl.code === 0 && kl.data?.rows?.length > 0,
    kl.code !== 0 ? kl.msg : undefined);

  // 4. get_recent_trades
  const rtEndpoint = ContractRouter.getEndpoint(CT, "recentTrades");
  const rt = await client.getPublicMd<any>(rtEndpoint, { symbol: SYMBOL });
  check("4. get_recent_trades", !rt.error,
    rt.error ? JSON.stringify(rt.error) : undefined);

  // 5. get_funding_rate
  const frEndpoint = ContractRouter.getEndpoint(CT, "fundingRate");
  const fr = await client.getPublic<any>(frEndpoint, { symbol: ".BTCFR8H", limit: 3 });
  check("5. get_funding_rate", fr.code === 0 && fr.data?.rows?.length > 0,
    fr.code !== 0 ? fr.msg : undefined);

  // ============================================================
  //  ACCOUNT / READ TOOLS (5)
  // ============================================================

  // 6. get_account
  const acctEndpoint = ContractRouter.getEndpoint(CT, "account");
  const acct = await client.get<any>(acctEndpoint, { currency: "USDT" });
  log("6. get_account (raw)", acct.code !== 0 ? acct.msg : acct.data);
  check("6. get_account", acct.code === 0,
    acct.code !== 0 ? acct.msg : undefined);

  // 7. get_positions
  const posEndpoint = ContractRouter.getEndpoint(CT, "positions");
  const pos = await client.get<any>(posEndpoint, { currency: "USDT" });
  check("7. get_positions", pos.code === 0,
    pos.code !== 0 ? pos.msg : undefined);

  // 8. get_open_orders — Phemex returns OM_ORDER_NOT_FOUND when no orders
  const ooEndpoint = ContractRouter.getEndpoint(CT, "openOrders");
  const oo = await client.get<any>(ooEndpoint, { symbol: SYMBOL });
  const ooOk = oo.code === 0 || oo.msg === "OM_ORDER_NOT_FOUND";
  check("8. get_open_orders", ooOk,
    !ooOk ? `${oo.code}: ${oo.msg}` : (oo.msg === "OM_ORDER_NOT_FOUND" ? "(no orders — expected)" : undefined));

  // 9. get_order_history
  const ohEndpoint = ContractRouter.getEndpoint(CT, "orderHistory");
  const oh = await client.get<any>(ohEndpoint, { symbol: SYMBOL, limit: 5 });
  check("9. get_order_history", oh.code === 0,
    oh.code !== 0 ? oh.msg : undefined);

  // 10. get_trades
  const thEndpoint = ContractRouter.getEndpoint(CT, "tradeHistory");
  const th = await client.get<any>(thEndpoint, { symbol: SYMBOL, limit: 5 });
  check("10. get_trades", th.code === 0,
    th.code !== 0 ? th.msg : undefined);

  // ============================================================
  //  TRADING TOOLS (6)
  // ============================================================

  // Get current price — USDT-M v2 uses closeRp
  const lastPrice = ticker.result?.closeRp ?? ticker.result?.lastPrice ?? ticker.result?.close;
  console.log(`\nCurrent BTC price: ${lastPrice}`);
  check("   price from ticker", lastPrice !== undefined, `keys: ${Object.keys(ticker.result || {}).join(", ")}`);

  // 11. set_leverage — 5x
  const levEndpoint = ContractRouter.getEndpoint(CT, "setLeverage");
  const lev = await client.putWithQuery<any>(levEndpoint, {
    symbol: SYMBOL,
    leverageRr: "20",
  });
  check("11. set_leverage (20x)", lev.code === 0,
    lev.code !== 0 ? `${client.getErrorMessage(lev.code)} - ${lev.msg}` : undefined);

  // 12. place_order — limit buy far below market
  if (lastPrice !== undefined) {
    const limitPrice = String(Math.floor(Number(lastPrice) * 0.8));
    const placeEndpoint = ContractRouter.getEndpoint(CT, "placeOrder");
    const clOrdID = "regtest" + Date.now().toString().slice(-8);
    const placeParams: Record<string, string | number | boolean> = {
      symbol: SYMBOL,
      clOrdID,
      side: "Buy",
      posSide: "Merged",  // Required by Phemex API even in OneWay mode
      orderQtyRq: "0.001",
      ordType: "Limit",
      priceRp: limitPrice,
      timeInForce: "GoodTillCancel",
    };
    const placed = await client.putWithQuery<any>(placeEndpoint, placeParams);
    check("12. place_order (limit buy 0.001@" + limitPrice + ")", placed.code === 0,
      placed.code !== 0 ? `${client.getErrorMessage(placed.code)} - ${placed.msg}` : undefined);
    log("   place_order response", placed.code !== 0 ? placed.msg : placed.data);

    const orderID = placed.data?.orderID;

    // 13. amend_order
    if (orderID) {
      const amendEndpoint = ContractRouter.getEndpoint(CT, "amendOrder");
      const newPrice = String(Number(limitPrice) - 100);
      const amended = await client.putWithQuery<any>(amendEndpoint, {
        symbol: SYMBOL,
        orderID,
        priceRp: newPrice,
        posSide: "Merged",
      });
      check("13. amend_order (price → " + newPrice + ")", amended.code === 0,
        amended.code !== 0 ? `${client.getErrorMessage(amended.code)} - ${amended.msg}` : undefined);
    } else {
      check("13. amend_order", false, "no orderID from place_order");
    }

    // Verify open orders
    const oo2 = await client.get<any>(ooEndpoint, { symbol: SYMBOL });
    const hasOrder = oo2.data?.rows?.some((o: any) => o.orderID === orderID);
    check("   open_orders contains placed order", hasOrder === true);

    // 14. cancel_order
    if (orderID) {
      const cancelEndpoint = ContractRouter.getEndpoint(CT, "cancelOrder");
      const cancelled = await client.delete<any>(cancelEndpoint, { symbol: SYMBOL, orderID, posSide: "Merged" });
      check("14. cancel_order", cancelled.code === 0,
        cancelled.code !== 0 ? `${client.getErrorMessage(cancelled.code)} - ${cancelled.msg}` : undefined);
    } else {
      check("14. cancel_order", false, "no orderID");
    }
  } else {
    check("12. place_order", false, "no price from ticker");
    check("13. amend_order", false, "skipped");
    check("14. cancel_order", false, "skipped");
  }

  // 15. cancel_all_orders
  const cancelAllEndpoint = ContractRouter.getEndpoint(CT, "cancelAll");
  const cancelAll = await client.delete<any>(cancelAllEndpoint, { symbol: SYMBOL });
  check("15. cancel_all_orders", cancelAll.code === 0,
    cancelAll.code !== 0 ? `${client.getErrorMessage(cancelAll.code)} - ${cancelAll.msg}` : undefined);

  // 16. switch_pos_mode — Hedged then back to OneWay
  const spm1 = await client.putWithQuery<any>(spmEndpoint, { symbol: SYMBOL, targetPosMode: "Hedged" });
  check("16. switch_pos_mode → Hedged", spm1.code === 0,
    spm1.code !== 0 ? `${client.getErrorMessage(spm1.code)} - ${spm1.msg}` : undefined);

  if (spm1.code === 0) {
    const spm2 = await client.putWithQuery<any>(spmEndpoint, { symbol: SYMBOL, targetPosMode: "OneWay" });
    check("   switch_pos_mode → OneWay (restore)", spm2.code === 0,
      spm2.code !== 0 ? `${client.getErrorMessage(spm2.code)} - ${spm2.msg}` : undefined);
  }

  // ============================================================
  //  SUMMARY
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log(`  USDT-M REGRESSION: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
