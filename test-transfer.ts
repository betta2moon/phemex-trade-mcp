import "dotenv/config";
import { PhemexClient } from "./src/client.js";
import { ProductInfoCache } from "./src/product-info.js";

const client = new PhemexClient({
  apiKey: process.env.PHEMEX_API_KEY ?? "",
  apiSecret: process.env.PHEMEX_API_SECRET ?? "",
  baseUrl: process.env.PHEMEX_API_URL ?? "https://api.phemex.com",
});

const productCache = new ProductInfoCache(process.env.PHEMEX_API_URL ?? "https://api.phemex.com");

const CURRENCY = "USDT";
const AMOUNT = "1";  // 1 USDT — small enough to be safe

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

  // Verify currency scale is available
  const amountEv = productCache.scaleCurrencyAmount(CURRENCY, AMOUNT);
  check(`scaleCurrencyAmount("${CURRENCY}", "${AMOUNT}") = ${amountEv}`, amountEv === 100000000);

  const amountBack = productCache.unscaleCurrencyAmount(CURRENCY, amountEv);
  check(`unscaleCurrencyAmount("${CURRENCY}", ${amountEv}) = "${amountBack}"`, amountBack === AMOUNT);

  // ============================================================
  //  1. TRANSFER: Futures → Spot (more likely to have futures balance)
  // ============================================================
  log("1. transfer_funds: Futures → Spot", { currency: CURRENCY, amount: AMOUNT });

  const toSpot = await client.post<any>("/assets/transfer", {
    amountEv,
    currency: CURRENCY,
    moveOp: 1,  // futures → spot
  });
  log("   response", toSpot);
  const toSpotOk = toSpot.code === 0;
  check("1. transfer futures → spot", toSpotOk,
    !toSpotOk ? `${client.getErrorMessage(toSpot.code)} - ${toSpot.msg}` : undefined);

  if (toSpotOk) {
    const data = toSpot.data;
    check("   has amountEv", typeof data.amountEv === "number");
    check("   has status", typeof data.status === "number");
    check("   status is success (10)", data.status === 10);
    check("   has linkKey", typeof data.linkKey === "string");
  }

  await new Promise(r => setTimeout(r, 1000));

  // ============================================================
  //  2. TRANSFER: Spot → Futures (move it back)
  // ============================================================
  if (toSpotOk) {
    log("2. transfer_funds: Spot → Futures", { currency: CURRENCY, amount: AMOUNT });

    const toFutures = await client.post<any>("/assets/transfer", {
      amountEv,
      currency: CURRENCY,
      moveOp: 2,  // spot → futures
    });
    log("   response", toFutures);
    check("2. transfer spot → futures", toFutures.code === 0,
      toFutures.code !== 0 ? `${client.getErrorMessage(toFutures.code)} - ${toFutures.msg}` : undefined);

    if (toFutures.code === 0) {
      check("   status is success (10)", toFutures.data.status === 10);
    }
  } else {
    console.log("  ⏭️  Skipping spot → futures (no balance transferred)");
  }

  await new Promise(r => setTimeout(r, 1000));

  // ============================================================
  //  3. GET TRANSFER HISTORY (futures → spot direction)
  // ============================================================
  const historyF2S = await client.get<any>("/assets/transfer", {
    currency: CURRENCY,
    side: 1,
    bizType: 11,
    limit: 5,
  });
  log("3. get_transfer_history (futures → spot)", historyF2S);
  check("3. get_transfer_history (futures→spot)", historyF2S.code === 0,
    historyF2S.code !== 0 ? `${client.getErrorMessage(historyF2S.code)} - ${historyF2S.msg}` : undefined);

  if (historyF2S.code === 0) {
    // API returns { rows: [...] }
    const rows = historyF2S.data?.rows ?? (Array.isArray(historyF2S.data) ? historyF2S.data : []);
    check("   has transfer records", rows.length > 0, `got ${rows.length} rows`);
    if (rows.length > 0) {
      const latest = rows[0];
      check("   latest has amountEv", typeof latest.amountEv === "number");
      check("   latest has currency", latest.currency === CURRENCY);
      check("   latest has bizType", typeof latest.bizType === "number");
      // Note: API doesn't filter by side/bizType — returns all transfers
      // The tool does client-side filtering via bizType

      if (typeof latest.amountEv === "number") {
        const displayAmt = productCache.unscaleCurrencyAmount(CURRENCY, latest.amountEv);
        console.log(`   Latest transfer: ${displayAmt} ${CURRENCY}, status=${latest.status}, bizType=${latest.bizType}`);
      }
    }
  }

  // ============================================================
  //  4. GET TRANSFER HISTORY (spot → futures direction)
  // ============================================================
  const historyS2F = await client.get<any>("/assets/transfer", {
    currency: CURRENCY,
    side: 2,
    bizType: 10,
    limit: 5,
  });
  check("4. get_transfer_history (spot→futures)", historyS2F.code === 0,
    historyS2F.code !== 0 ? `${client.getErrorMessage(historyS2F.code)} - ${historyS2F.msg}` : undefined);

  if (historyS2F.code === 0) {
    const rows = historyS2F.data?.rows ?? (Array.isArray(historyS2F.data) ? historyS2F.data : []);
    check("   has transfer records", rows.length > 0, `got ${rows.length} rows`);
  }

  // ============================================================
  //  5. GET TRANSFER HISTORY (both directions — no side/bizType filter)
  // ============================================================
  const historyAll = await client.get<any>("/assets/transfer", {
    currency: CURRENCY,
    limit: 10,
  });
  check("5. get_transfer_history (both directions)", historyAll.code === 0,
    historyAll.code !== 0 ? `${client.getErrorMessage(historyAll.code)} - ${historyAll.msg}` : undefined);

  if (historyAll.code === 0) {
    const rows = historyAll.data?.rows ?? (Array.isArray(historyAll.data) ? historyAll.data : []);
    check("   has records", rows.length > 0, `got ${rows.length} rows`);
  }

  // ============================================================
  //  SUMMARY
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log(`  TRANSFER E2E: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
