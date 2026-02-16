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

const SYMBOL = "SOLUSDT";        // user-facing symbol (no s prefix)
const SPOT_SYMBOL = "sSOLUSDT";  // resolved spot symbol

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
  // ============================================================
  //  SETUP
  // ============================================================
  await productCache.init();
  check("ProductInfoCache init", productCache.isLoaded());

  // Verify spot product is cached
  const spotInfo = productCache.get(SPOT_SYMBOL);
  check(`Spot product ${SPOT_SYMBOL} cached`, spotInfo !== undefined);
  if (spotInfo) {
    check("  contractType is spot", spotInfo.contractType === "spot");
    check("  priceScale is 10^8", spotInfo.priceScale === 100000000);
  }

  // Test symbol resolution
  const resolved = ContractRouter.resolveSymbol("spot", SYMBOL);
  check(`resolveSymbol("spot", "${SYMBOL}") = "${resolved}"`, resolved === SPOT_SYMBOL);

  // ============================================================
  //  0. FUND SPOT WALLET — transfer 10 USDT from futures
  // ============================================================
  // Try transferring USDT from futures → spot (try 2, then 1 USDT as fallback)
  let fundOk = false;
  for (const amt of ["5", "3", "2", "1"]) {
    const fundAmountEv = productCache.scaleCurrencyAmount("USDT", amt);
    const fundRes = await client.post<unknown>("/assets/transfer", {
      amountEv: fundAmountEv,
      currency: "USDT",
      moveOp: 1,  // futures → spot
    });
    if (fundRes.code === 0) {
      fundOk = true;
      check(`0. fund spot wallet (${amt} USDT)`, true);
      break;
    }
  }
  if (!fundOk) {
    console.log("   Could not transfer from futures — using existing spot balance.");
  }

  await new Promise(r => setTimeout(r, 1000));

  // ============================================================
  //  1. GET SPOT WALLET
  // ============================================================
  log("1. get_spot_wallet", { endpoint: "GET /spot/wallets" });

  const wallets = await client.get<unknown>("/spot/wallets");
  log("   response", wallets);
  check("1. get_spot_wallet", wallets.code === 0,
    wallets.code !== 0 ? `${client.getErrorMessage(wallets.code)} - ${wallets.msg}` : undefined);

  if (wallets.code === 0 && Array.isArray(wallets.data)) {
    check("   returns array", true);
    check(`   has wallets (${(wallets.data as unknown[]).length})`, (wallets.data as unknown[]).length > 0);

    // Check first wallet has expected fields
    if ((wallets.data as unknown[]).length > 0) {
      const first = (wallets.data as Record<string, unknown>[])[0];
      check("   has currency field", typeof first.currency === "string");
      check("   has balanceEv field", typeof first.balanceEv === "number");
    }
  }

  // ============================================================
  //  2. GET SPOT TICKER
  // ============================================================
  log("2. get_ticker (spot)", { symbol: SPOT_SYMBOL });

  const endpoint = ContractRouter.getEndpoint("spot", "ticker");
  const ticker = await client.getPublicMd<unknown>(endpoint, { symbol: SPOT_SYMBOL });
  log("   response", ticker);
  check("2. get_ticker (spot)", ticker.error === null,
    ticker.error ? `${ticker.error.message} (code: ${ticker.error.code})` : undefined);

  if (ticker.error === null && ticker.result) {
    const result = ticker.result as Record<string, unknown>;
    check("   has symbol", result.symbol === SPOT_SYMBOL);
  }

  // ============================================================
  //  3. GET SPOT ORDERBOOK
  // ============================================================
  log("3. get_orderbook (spot)", { symbol: SPOT_SYMBOL });

  const obEndpoint = ContractRouter.getEndpoint("spot", "orderbook");
  const orderbook = await client.getPublicMd<unknown>(obEndpoint, { symbol: SPOT_SYMBOL, id: 0 });
  log("   response (truncated)", {
    error: orderbook.error,
    hasResult: !!orderbook.result,
    resultKeys: orderbook.result ? Object.keys(orderbook.result as object) : [],
  });
  check("3. get_orderbook (spot)", orderbook.error === null,
    orderbook.error ? `${orderbook.error.message}` : undefined);

  if (orderbook.error === null && orderbook.result) {
    const ob = orderbook.result as Record<string, unknown>;
    // Spot orderbook nests asks/bids inside "book" property
    const book = ob.book as Record<string, unknown> | undefined;
    check("   has book", book !== undefined);
    if (book) {
      check("   book has asks/bids", Array.isArray(book.asks) && Array.isArray(book.bids));
    }
  }

  // ============================================================
  //  4. GET SPOT RECENT TRADES
  // ============================================================
  log("4. get_recent_trades (spot)", { symbol: SPOT_SYMBOL });

  const rtEndpoint = ContractRouter.getEndpoint("spot", "recentTrades");
  const recentTrades = await client.getPublicMd<unknown>(rtEndpoint, { symbol: SPOT_SYMBOL });
  check("4. get_recent_trades (spot)", recentTrades.error === null,
    recentTrades.error ? `${recentTrades.error.message}` : undefined);

  if (recentTrades.error === null && recentTrades.result) {
    const rt = recentTrades.result as Record<string, unknown>;
    check("   has trades array", Array.isArray(rt.trades));
  }

  // ============================================================
  //  5. GET SPOT KLINES
  // ============================================================
  log("5. get_klines (spot)", { symbol: SPOT_SYMBOL });

  const klEndpoint = ContractRouter.getEndpoint("spot", "klines");
  const to = Math.floor(Date.now() / 1000);
  const from = to - 3600 * 10;  // last 10 hours
  const klines = await client.getPublic<unknown>(klEndpoint, {
    symbol: SPOT_SYMBOL,
    resolution: 3600,
    limit: 10,
    from,
    to,
  });
  check("5. get_klines (spot)", klines.code === 0,
    klines.code !== 0 ? `${client.getErrorMessage(klines.code)} - ${klines.msg}` : undefined);

  if (klines.code === 0) {
    const rows = klines.data as Record<string, unknown>;
    check("   has rows", Array.isArray(rows.rows));
  }

  // ============================================================
  //  ORDER FLOW — Budget: 2 USDT, SOL ~$87. Min order value: 1 USDT.
  //  Strategy: buy → limit sell (for amend/cancel) → sell → ByQuote buy
  //            → limit buy (for cancel-all) → cleanup
  // ============================================================

  const placeEndpoint = ContractRouter.getEndpoint("spot", "placeOrder");

  // ============================================================
  //  6. MARKET BUY (real fill — ByBase, 0.02 SOL ~$1.74)
  // ============================================================
  log("6. market buy (ByBase)", { symbol: SPOT_SYMBOL, qty: "0.02 SOL" });

  const mktBuyQtyEv = productCache.scaleValue(SPOT_SYMBOL, "0.02");
  const mktBuyClOrdID = `tMB${Date.now()}`.slice(0, 20);

  const mktBuyRes = await client.putWithQuery<unknown>(placeEndpoint, {
    symbol: SPOT_SYMBOL, side: "Buy", ordType: "Market",
    timeInForce: "ImmediateOrCancel", qtyType: "ByBase",
    baseQtyEv: mktBuyQtyEv, clOrdID: mktBuyClOrdID,
  });
  log("   response", mktBuyRes);
  const mktBuyOk = mktBuyRes.code === 0;
  check("6. market buy", mktBuyOk,
    !mktBuyOk ? `${client.getErrorMessage(mktBuyRes.code)} - ${mktBuyRes.msg}` : undefined);

  if (mktBuyOk) {
    const data = mktBuyRes.data as Record<string, unknown>;
    check("   has orderID", typeof data.orderID === "string");
    check("   side is Buy", data.side === "Buy");
    check("   ordType is Market", data.ordType === "Market");
    const converted = productCache.convertResponse(SPOT_SYMBOL, data);
    log("   converted", converted);
    check("   conversion works", typeof converted === "object");
  }

  await new Promise(r => setTimeout(r, 1000));

  // ============================================================
  //  7. LIMIT SELL (far above market — keeps SOL, tests amend/cancel)
  //     0.01 SOL @ $5000 = $50 value → won't fill
  // ============================================================
  log("7. limit sell (far above market)", { symbol: SPOT_SYMBOL });

  const limSellPriceEp = productCache.scalePrice(SPOT_SYMBOL, "5000");
  const limSellQtyEv = productCache.scaleValue(SPOT_SYMBOL, "0.01");
  const limSellClOrdID = `tLS${Date.now()}`.slice(0, 20);

  const limSellRes = await client.putWithQuery<unknown>(placeEndpoint, {
    symbol: SPOT_SYMBOL, side: "Sell", ordType: "Limit",
    timeInForce: "GoodTillCancel", qtyType: "ByBase",
    baseQtyEv: limSellQtyEv, priceEp: limSellPriceEp, clOrdID: limSellClOrdID,
  });
  log("   response", limSellRes);
  const limSellOk = limSellRes.code === 0;
  check("7. limit sell", limSellOk,
    !limSellOk ? `${client.getErrorMessage(limSellRes.code)} - ${limSellRes.msg}` : undefined);

  let limSellOrderID: string | undefined;
  if (limSellOk) {
    const data = limSellRes.data as Record<string, unknown>;
    limSellOrderID = data.orderID as string;
    check("   has orderID", typeof limSellOrderID === "string");
    check("   side is Sell", data.side === "Sell");
  }

  await new Promise(r => setTimeout(r, 500));

  // ============================================================
  //  8. AMEND ORDER — change limit sell price
  // ============================================================
  if (limSellOk && limSellOrderID) {
    log("8. amend_order (limit sell)", { symbol: SPOT_SYMBOL, orderID: limSellOrderID });

    const amendEndpoint = ContractRouter.getEndpoint("spot", "amendOrder");
    const newPriceEp = productCache.scalePrice(SPOT_SYMBOL, "4500");

    const amendRes = await client.putWithQuery<unknown>(amendEndpoint, {
      symbol: SPOT_SYMBOL, orderID: limSellOrderID, priceEp: newPriceEp,
    });
    log("   response", amendRes);
    check("8. amend_order", amendRes.code === 0,
      amendRes.code !== 0 ? `${client.getErrorMessage(amendRes.code)} - ${amendRes.msg}` : undefined);
  }

  await new Promise(r => setTimeout(r, 500));

  // ============================================================
  //  9. GET OPEN ORDERS — verify limit sell is there
  // ============================================================
  log("9. get_open_orders", { symbol: SPOT_SYMBOL });

  const openEndpoint = ContractRouter.getEndpoint("spot", "openOrders");
  const openOrders = await client.get<unknown>(openEndpoint, { symbol: SPOT_SYMBOL });
  check("9. get_open_orders", openOrders.code === 0,
    openOrders.code !== 0 ? `${client.getErrorMessage(openOrders.code)} - ${openOrders.msg}` : undefined);

  if (openOrders.code === 0 && Array.isArray(openOrders.data)) {
    const orders = openOrders.data as Record<string, unknown>[];
    if (limSellOrderID) check("   limit sell found", orders.some(o => o.orderID === limSellOrderID));
  }

  // ============================================================
  //  10. CANCEL ORDER — cancel the limit sell
  // ============================================================
  if (limSellOk && limSellOrderID) {
    log("10. cancel_order (limit sell)", { symbol: SPOT_SYMBOL, orderID: limSellOrderID });

    const cancelEndpoint = ContractRouter.getEndpoint("spot", "cancelOrder");
    const cancelRes = await client.delete<unknown>(cancelEndpoint, {
      symbol: SPOT_SYMBOL, orderID: limSellOrderID,
    });
    log("   response", cancelRes);
    check("10. cancel_order", cancelRes.code === 0,
      cancelRes.code !== 0 ? `${client.getErrorMessage(cancelRes.code)} - ${cancelRes.msg}` : undefined);
  }

  await new Promise(r => setTimeout(r, 500));

  // ============================================================
  //  11. MARKET SELL (real fill — sell all SOL we have)
  // ============================================================
  log("11. market sell (ByBase)", { symbol: SPOT_SYMBOL });

  // Check actual SOL balance before selling
  let mktSellOk = false;
  {
    const w = await client.get<unknown>("/spot/wallets");
    const solW = (w.code === 0 && Array.isArray(w.data))
      ? (w.data as Record<string, unknown>[]).find(x => x.currency === "SOL") : undefined;
    const solBal = (solW?.balanceEv as number) ?? 0;
    console.log(`   SOL balance: ${solBal / 1e8} SOL (${solBal} Ev)`);

    if (solBal > 0) {
      const mktSellClOrdID = `tMS${Date.now()}`.slice(0, 20);
      const mktSellRes = await client.putWithQuery<unknown>(placeEndpoint, {
        symbol: SPOT_SYMBOL, side: "Sell", ordType: "Market",
        timeInForce: "ImmediateOrCancel", qtyType: "ByBase",
        baseQtyEv: solBal, clOrdID: mktSellClOrdID,
      });
      log("   response", mktSellRes);
      mktSellOk = mktSellRes.code === 0;
      check("11. market sell", mktSellOk,
        !mktSellOk ? `${client.getErrorMessage(mktSellRes.code)} - ${mktSellRes.msg}` : undefined);

      if (mktSellOk) {
        const data = mktSellRes.data as Record<string, unknown>;
        check("   has orderID", typeof data.orderID === "string");
        check("   side is Sell", data.side === "Sell");
        check("   ordType is Market", data.ordType === "Market");
      }
    } else {
      check("11. market sell", false, "no SOL balance to sell");
    }
  }

  await new Promise(r => setTimeout(r, 1000));

  // ============================================================
  //  12. MARKET BUY (ByQuote — spend available USDT, min 1)
  // ============================================================
  log("12. market buy (ByQuote)", { symbol: SPOT_SYMBOL });

  let quoteOk = false;
  {
    // Check USDT balance for ByQuote buy
    const w = await client.get<unknown>("/spot/wallets");
    const usdtW = (w.code === 0 && Array.isArray(w.data))
      ? (w.data as Record<string, unknown>[]).find(x => x.currency === "USDT") : undefined;
    const usdtBal = (usdtW?.balanceEv as number) ?? 0;
    console.log(`   USDT balance: ${usdtBal / 1e8} USDT (${usdtBal} Ev)`);

    // Need at least 1 USDT (min order value)
    const quoteAmount = Math.min(usdtBal, 100000000);  // spend up to 1 USDT
    if (quoteAmount >= 100000000) {
      const quoteClOrdID = `tMQ${Date.now()}`.slice(0, 20);
      const quoteRes = await client.putWithQuery<unknown>(placeEndpoint, {
        symbol: SPOT_SYMBOL, side: "Buy", ordType: "Market",
        timeInForce: "ImmediateOrCancel", qtyType: "ByQuote",
        quoteQtyEv: quoteAmount, clOrdID: quoteClOrdID,
      });
      log("   response", quoteRes);
      quoteOk = quoteRes.code === 0;
      check("12. market buy (ByQuote)", quoteOk,
        !quoteOk ? `${client.getErrorMessage(quoteRes.code)} - ${quoteRes.msg}` : undefined);

      if (quoteOk) {
        const data = quoteRes.data as Record<string, unknown>;
        check("   has orderID", typeof data.orderID === "string");
        check("   qtyType is ByQuote", data.qtyType === "ByQuote");
      }
    } else {
      check("12. market buy (ByQuote)", false, `only ${usdtBal / 1e8} USDT, need ≥1`);
    }
  }

  await new Promise(r => setTimeout(r, 1000));

  // Sell back ByQuote purchase (all SOL)
  {
    const w = await client.get<unknown>("/spot/wallets");
    const solW = (w.code === 0 && Array.isArray(w.data))
      ? (w.data as Record<string, unknown>[]).find(x => x.currency === "SOL") : undefined;
    const solBal = (solW?.balanceEv as number) ?? 0;
    if (solBal > 0) {
      const sellBackClOrdID = `tSB${Date.now()}`.slice(0, 20);
      const sellBackRes = await client.putWithQuery<unknown>(placeEndpoint, {
        symbol: SPOT_SYMBOL, side: "Sell", ordType: "Market",
        timeInForce: "ImmediateOrCancel", qtyType: "ByBase",
        baseQtyEv: solBal, clOrdID: sellBackClOrdID,
      });
      // Best-effort sell-back — may fail if dust is below min order value
      if (sellBackRes.code === 0) {
        console.log("   ✅ sold back ByQuote SOL");
      } else {
        console.log(`   ⚠️  sell-back skipped (${client.getErrorMessage(sellBackRes.code)}) — dust below min order value`);
      }
    }
  }

  await new Promise(r => setTimeout(r, 500));

  // ============================================================
  //  13. LIMIT BUY (for cancel-all test: ~$1 value at $10/SOL)
  // ============================================================
  log("13. limit buy (for cancel-all test)", { symbol: SPOT_SYMBOL });

  let limBuyOk = false;
  {
    // Check USDT balance — need at least ~$1 for min order value
    const w = await client.get<unknown>("/spot/wallets");
    const usdtW = (w.code === 0 && Array.isArray(w.data))
      ? (w.data as Record<string, unknown>[]).find(x => x.currency === "USDT") : undefined;
    const usdtBal = (usdtW?.balanceEv as number) ?? 0;
    console.log(`   USDT balance: ${usdtBal / 1e8} USDT`);

    if (usdtBal >= 150000000) {  // need ~1.5 USDT
      const limBuyPriceEp = productCache.scalePrice(SPOT_SYMBOL, "15");
      const limBuyQtyEv = productCache.scaleValue(SPOT_SYMBOL, "0.1");
      const limBuyClOrdID = `tLB${Date.now()}`.slice(0, 20);

      const limBuyRes = await client.putWithQuery<unknown>(placeEndpoint, {
        symbol: SPOT_SYMBOL, side: "Buy", ordType: "Limit",
        timeInForce: "GoodTillCancel", qtyType: "ByBase",
        baseQtyEv: limBuyQtyEv, priceEp: limBuyPriceEp, clOrdID: limBuyClOrdID,
      });
      log("   response", limBuyRes);
      limBuyOk = limBuyRes.code === 0;
      check("13. limit buy", limBuyOk,
        !limBuyOk ? `${client.getErrorMessage(limBuyRes.code)} - ${limBuyRes.msg}` : undefined);
    } else {
      console.log("   ⚠️  Skipping limit buy — insufficient USDT balance");
    }
  }

  await new Promise(r => setTimeout(r, 500));

  // ============================================================
  //  14. CANCEL ALL — clean up
  // ============================================================
  log("14. cancel_all_orders", { symbol: SPOT_SYMBOL });

  const cancelAllEndpoint = ContractRouter.getEndpoint("spot", "cancelAll");
  const cancelAllRes = await client.delete<unknown>(cancelAllEndpoint, {
    symbol: SPOT_SYMBOL,
  });
  log("   response", cancelAllRes);
  check("14. cancel_all_orders", cancelAllRes.code === 0,
    cancelAllRes.code !== 0 ? `${client.getErrorMessage(cancelAllRes.code)} - ${cancelAllRes.msg}` : undefined);

  await new Promise(r => setTimeout(r, 1000));

  // Verify no open orders remain
  {
    const oe = ContractRouter.getEndpoint("spot", "openOrders");
    const oo = await client.get<unknown>(oe, { symbol: SPOT_SYMBOL });
    if (oo.code === 0 && Array.isArray(oo.data)) {
      check("   no orders remaining", (oo.data as unknown[]).length === 0,
        `${(oo.data as unknown[]).length} still open`);
    }
  }

  // ============================================================
  //  15. GET ORDER HISTORY — should include filled + cancelled orders
  // ============================================================
  log("15. get_order_history", { symbol: SPOT_SYMBOL });

  const histEndpoint = ContractRouter.getEndpoint("spot", "orderHistory");
  const history = await client.get<unknown>(histEndpoint, { symbol: SPOT_SYMBOL, limit: 10 });
  log("   response (summary)", {
    code: history.code,
    dataType: typeof history.data,
    isArray: Array.isArray(history.data),
    hasRows: typeof history.data === "object" && history.data !== null && "rows" in (history.data as Record<string, unknown>),
  });
  check("15. get_order_history", history.code === 0,
    history.code !== 0 ? `${client.getErrorMessage(history.code)} - ${history.msg}` : undefined);

  if (history.code === 0) {
    const rows = Array.isArray(history.data)
      ? (history.data as Record<string, unknown>[])
      : ((history.data as Record<string, unknown>)?.rows as Record<string, unknown>[] ?? []);
    check("   has order history records", rows.length > 0, `got ${rows.length}`);
    // Check we can see both filled and cancelled orders
    if (rows.length > 0) {
      const statuses = rows.map((r: Record<string, unknown>) => r.ordStatus);
      const uniqueStatuses = [...new Set(statuses)];
      console.log(`   Order statuses seen: ${uniqueStatuses.join(", ")}`);
    }
  }

  // ============================================================
  //  16. GET TRADE HISTORY — should have our market fills
  // ============================================================
  log("16. get_trades (spot)", { symbol: SPOT_SYMBOL });

  const tradeEndpoint = ContractRouter.getEndpoint("spot", "tradeHistory");
  const trades = await client.get<unknown>(tradeEndpoint, { symbol: SPOT_SYMBOL, limit: 10 });
  check("16. get_trades", trades.code === 0,
    trades.code !== 0 ? `${client.getErrorMessage(trades.code)} - ${trades.msg}` : undefined);

  if (trades.code === 0) {
    const rows = Array.isArray(trades.data)
      ? (trades.data as Record<string, unknown>[])
      : ((trades.data as Record<string, unknown>)?.rows as Record<string, unknown>[] ?? []);
    check("   has trade records (from market fills)", rows.length > 0, `got ${rows.length}`);
    if (rows.length > 0) {
      const sides = rows.map((r: Record<string, unknown>) => r.side);
      const uniqueSides = [...new Set(sides)];
      console.log(`   Trade sides seen: ${uniqueSides.join(", ")}`);
    }
  }

  // ============================================================
  //  CLEANUP — transfer USDT back to futures
  // ============================================================
  log("CLEANUP: transfer USDT spot → futures", {});

  // Get current spot USDT balance
  const cleanupWallets = await client.get<unknown>("/spot/wallets");
  if (cleanupWallets.code === 0 && Array.isArray(cleanupWallets.data)) {
    const usdtWallet = (cleanupWallets.data as Record<string, unknown>[]).find(
      (w) => w.currency === "USDT"
    );
    const usdtBalance = (usdtWallet?.balanceEv as number) ?? 0;
    if (usdtBalance > 0) {
      const backRes = await client.post<unknown>("/assets/transfer", {
        amountEv: usdtBalance,
        currency: "USDT",
        moveOp: 2,  // spot → futures
      });
      check("   transfer USDT back to futures", backRes.code === 0,
        backRes.code !== 0 ? `${client.getErrorMessage(backRes.code)}` : undefined);
    } else {
      console.log("   No USDT balance to transfer back.");
    }
  }

  // Also transfer any SOL dust back if present
  if (cleanupWallets.code === 0 && Array.isArray(cleanupWallets.data)) {
    const solWallet = (cleanupWallets.data as Record<string, unknown>[]).find(
      (w) => w.currency === "SOL"
    );
    const solBalance = (solWallet?.balanceEv as number) ?? 0;
    if (solBalance > 0) {
      console.log(`   SOL dust remaining: ${solBalance / 1e8} SOL`);
    }
  }

  // ============================================================
  //  SUMMARY
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log(`  SPOT E2E: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
