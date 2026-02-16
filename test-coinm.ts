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

const SYMBOL = "cSOLUSD";
const CT: "inverse" = "inverse";

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

function convertRes(data: unknown) {
  return productCache.convertResponse(SYMBOL, data);
}

async function main() {
  // Init product cache
  await productCache.init();
  const info = productCache.get(SYMBOL);
  log("Product Info: " + SYMBOL, info);
  if (!info) { console.error(SYMBOL + " not found in products!"); process.exit(1); }

  // ============================================================
  //  MARKET DATA TOOLS (5)
  // ============================================================

  // 1. get_ticker
  const tickerEndpoint = ContractRouter.getEndpoint(CT, "ticker");
  const ticker = await client.getPublicMd<unknown>(tickerEndpoint, { symbol: SYMBOL });
  log("1. get_ticker (raw)", ticker.error ? ticker.error : ticker.result);
  log("1. get_ticker (converted)", ticker.error ? ticker.error : convertRes(ticker.result));

  // 2. get_orderbook
  const obEndpoint = ContractRouter.getEndpoint(CT, "orderbook");
  const ob = await client.getPublicMd<unknown>(obEndpoint, { symbol: SYMBOL });
  log("2. get_orderbook (top 3 bids/asks)", ob.error ? ob.error : {
    bids: (ob.result as any)?.book?.bids?.slice(0, 3),
    asks: (ob.result as any)?.book?.asks?.slice(0, 3),
  });

  // 3. get_klines
  const klEndpoint = ContractRouter.getEndpoint(CT, "klines");
  const to = Math.floor(Date.now() / 1000);
  const from = to - 3600 * 5;
  const kl = await client.getPublic<unknown>(klEndpoint, { symbol: SYMBOL, resolution: 3600, limit: 5, from, to });
  log("3. get_klines (5x 1h)", kl.code !== 0 ? kl.msg : `${(kl.data as any)?.rows?.length ?? "?"} klines`);

  // 4. get_recent_trades
  const rtEndpoint = ContractRouter.getEndpoint(CT, "recentTrades");
  const rt = await client.getPublicMd<unknown>(rtEndpoint, { symbol: SYMBOL });
  log("4. get_recent_trades", rt.error ? rt.error : `${(rt.result as any)?.trades?.length ?? "?"} trades`);

  // 5. get_funding_rate — use .SOLFR8H (shared across SOL contracts)
  const frEndpoint = ContractRouter.getEndpoint(CT, "fundingRate");
  const fr = await client.getPublic<unknown>(frEndpoint, { symbol: ".SOLFR8H", limit: 3 });
  log("5. get_funding_rate", fr.code !== 0 ? fr.msg : fr.data);

  // ============================================================
  //  ACCOUNT / READ TOOLS (5)
  // ============================================================

  // 6. get_account
  const acctEndpoint = ContractRouter.getEndpoint(CT, "account");
  const acct = await client.get<unknown>(acctEndpoint, { currency: "SOL" });
  log("6. get_account (SOL) raw", acct.code !== 0 ? acct.msg : acct.data);
  log("6. get_account (SOL) converted", acct.code !== 0 ? acct.msg : convertRes(acct.data));

  // 7. get_positions
  const posEndpoint = ContractRouter.getEndpoint(CT, "positions");
  const pos = await client.get<unknown>(posEndpoint, { currency: "SOL" });
  log("7. get_positions (SOL)", pos.code !== 0 ? pos.msg : convertRes(pos.data));

  // 8. get_open_orders
  const ooEndpoint = ContractRouter.getEndpoint(CT, "openOrders");
  const oo = await client.get<unknown>(ooEndpoint, { symbol: SYMBOL });
  log("8. get_open_orders", oo.code !== 0 ? oo.msg : oo.data);

  // 9. get_order_history
  const ohEndpoint = ContractRouter.getEndpoint(CT, "orderHistory");
  const oh = await client.get<unknown>(ohEndpoint, { symbol: SYMBOL, limit: 5 });
  log("9. get_order_history", oh.code !== 0 ? oh.msg : oh.data);

  // 10. get_trades
  const thEndpoint = ContractRouter.getEndpoint(CT, "tradeHistory");
  const th = await client.get<unknown>(thEndpoint, { symbol: SYMBOL, limit: 5 });
  log("10. get_trades", th.code !== 0 ? th.msg : th.data);

  // ============================================================
  //  TRADING TOOLS (6)
  // ============================================================

  // Get current price — inverse ticker uses lastEp (not lastPrice)
  const rawLastPrice = (ticker.result as any)?.lastEp;
  const lastPrice = rawLastPrice / info.priceScale;  // unscale from Ep
  console.log(`\nCurrent SOL price (raw Ep): ${rawLastPrice}`);
  console.log(`Current SOL price (decimal): ${lastPrice}`);

  // 11. set_leverage (2x)
  const levEndpoint = ContractRouter.getEndpoint(CT, "setLeverage");
  const levParams: Record<string, string | number | boolean> = {
    symbol: SYMBOL,
    leverageEr: productCache.scaleRatio(SYMBOL, "2"),
  };
  const lev = await client.putWithQuery<unknown>(levEndpoint, levParams);
  log("11. set_leverage (2x)", lev.code !== 0 ? `ERROR: ${client.getErrorMessage(lev.code)} - ${lev.msg}` : convertRes(lev.data));

  // 12. place_order — limit buy far below market (to test amend/cancel)
  const limitPrice = Math.floor(lastPrice * 0.9); // 10% below
  const placeEndpoint = ContractRouter.getEndpoint(CT, "placeOrder");
  const clOrdID = "test" + Date.now().toString().slice(-10);
  const placeParams: Record<string, string | number | boolean> = {
    symbol: SYMBOL,
    clOrdID,
    side: "Buy",
    orderQty: 10, // 10 contracts = ~$10
    ordType: "Limit",
    priceEp: productCache.scalePrice(SYMBOL, String(limitPrice)),
    timeInForce: "GoodTillCancel",
  };
  const placed = await client.putWithQuery<unknown>(placeEndpoint, placeParams);
  log("12. place_order (limit buy 10@" + limitPrice + ")", placed.code !== 0 ? `ERROR: ${client.getErrorMessage(placed.code)} - ${placed.msg}` : convertRes(placed.data));

  const orderID = (placed.data as any)?.orderID;

  // 13. amend_order — change price slightly
  if (orderID) {
    const amendEndpoint = ContractRouter.getEndpoint(CT, "amendOrder");
    const newPrice = limitPrice - 1;
    const amendParams: Record<string, string | number | boolean> = {
      symbol: SYMBOL,
      orderID,
      priceEp: productCache.scalePrice(SYMBOL, String(newPrice)),
    };
    const amended = await client.putWithQuery<unknown>(amendEndpoint, amendParams);
    log("13. amend_order (price → " + newPrice + ")", amended.code !== 0 ? `ERROR: ${client.getErrorMessage(amended.code)} - ${amended.msg}` : convertRes(amended.data));
  }

  // Check open orders after place+amend
  const oo2 = await client.get<unknown>(ooEndpoint, { symbol: SYMBOL });
  log("   open_orders after place+amend", oo2.code !== 0 ? oo2.msg : convertRes(oo2.data));

  // 14. cancel_order
  if (orderID) {
    const cancelEndpoint = ContractRouter.getEndpoint(CT, "cancelOrder");
    const cancelled = await client.delete<unknown>(cancelEndpoint, { symbol: SYMBOL, orderID });
    log("14. cancel_order", cancelled.code !== 0 ? `ERROR: ${client.getErrorMessage(cancelled.code)} - ${cancelled.msg}` : convertRes(cancelled.data));
  }

  // 15. place_order — MARKET buy 10 contracts (will fill)
  const clOrdID2 = "test" + Date.now().toString().slice(-10);
  const marketParams: Record<string, string | number | boolean> = {
    symbol: SYMBOL,
    clOrdID: clOrdID2,
    side: "Buy",
    orderQty: 10,
    ordType: "Market",
    timeInForce: "ImmediateOrCancel",
  };
  const marketBuy = await client.putWithQuery<unknown>(placeEndpoint, marketParams);
  log("15. place_order (market buy 10 contracts)", marketBuy.code !== 0 ? `ERROR: ${client.getErrorMessage(marketBuy.code)} - ${marketBuy.msg}` : convertRes(marketBuy.data));

  // Check position
  await new Promise(r => setTimeout(r, 1000));
  const pos2 = await client.get<unknown>(posEndpoint, { currency: "SOL" });
  log("   positions after market buy", pos2.code !== 0 ? pos2.msg : convertRes(pos2.data));

  // Close position — market sell 10 contracts (reduce only)
  const clOrdID3 = "close" + Date.now().toString().slice(-10);
  const closeParams: Record<string, string | number | boolean> = {
    symbol: SYMBOL,
    clOrdID: clOrdID3,
    side: "Sell",
    orderQty: 10,
    ordType: "Market",
    timeInForce: "ImmediateOrCancel",
    reduceOnly: true,
  };
  const closed = await client.putWithQuery<unknown>(placeEndpoint, closeParams);
  log("   close position (market sell reduce-only)", closed.code !== 0 ? `ERROR: ${client.getErrorMessage(closed.code)} - ${closed.msg}` : convertRes(closed.data));

  // 16. cancel_all_orders (cleanup)
  const cancelAllEndpoint = ContractRouter.getEndpoint(CT, "cancelAll");
  const cancelAll = await client.delete<unknown>(cancelAllEndpoint, { symbol: SYMBOL });
  log("16. cancel_all_orders (cleanup)", cancelAll.code !== 0 ? `ERROR: ${client.getErrorMessage(cancelAll.code)} - ${cancelAll.msg}` : convertRes(cancelAll.data));

  // Final account state
  await new Promise(r => setTimeout(r, 1000));
  const acctFinal = await client.get<unknown>(acctEndpoint, { currency: "SOL" });
  log("FINAL: account balance", acctFinal.code !== 0 ? acctFinal.msg : convertRes(acctFinal.data));

  // switch_pos_mode — test it last (switch to Hedged then back)
  // Try both -sync and non-sync endpoint variants
  const spmEndpoint = ContractRouter.getEndpoint(CT, "switchPosMode");
  console.log(`\nTrying switch_pos_mode endpoint: ${spmEndpoint}`);
  const spm1 = await client.putWithQuery<unknown>(spmEndpoint, { symbol: SYMBOL, targetPosMode: "Hedged" });
  log("17a. switch_pos_mode (sync) → Hedged", spm1.code !== 0 ? `ERROR: ${client.getErrorMessage(spm1.code)} - ${spm1.msg}` : convertRes(spm1.data));

  // If sync endpoint failed with 401, try without -sync
  if (spm1.code === 401 || (spm1 as any).msg?.includes("401")) {
    const altEndpoint = "/positions/switch-pos-mode";
    console.log(`\nRetrying with: ${altEndpoint}`);
    const spm1b = await client.putWithQuery<unknown>(altEndpoint, { symbol: SYMBOL, targetPosMode: "Hedged" });
    log("17b. switch_pos_mode (no-sync) → Hedged", spm1b.code !== 0 ? `ERROR: ${client.getErrorMessage(spm1b.code)} - ${spm1b.msg}` : convertRes(spm1b.data));

    if (spm1b.code === 0) {
      const spm2b = await client.putWithQuery<unknown>(altEndpoint, { symbol: SYMBOL, targetPosMode: "OneWay" });
      log("   switch_pos_mode (no-sync) → OneWay (restore)", spm2b.code !== 0 ? `ERROR: ${client.getErrorMessage(spm2b.code)} - ${spm2b.msg}` : convertRes(spm2b.data));
    }
  } else if (spm1.code === 0) {
    const spm2 = await client.putWithQuery<unknown>(spmEndpoint, { symbol: SYMBOL, targetPosMode: "OneWay" });
    log("   switch_pos_mode → OneWay (restore)", spm2.code !== 0 ? `ERROR: ${client.getErrorMessage(spm2.code)} - ${spm2.msg}` : convertRes(spm2.data));
  }

  console.log("\n" + "=".repeat(60));
  console.log("  ALL TESTS COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
