/**
 * CLI E2E test — USDT-M (linear) endpoints.
 *
 * Spawns `node dist/cli.js` as a child process, verifying the full pipeline:
 *   CLI args → parseCliArgs → param-helpers → API call → JSON output
 *
 * Focus: integer AND float CLI params (--price, --orderQty, --resolution, --limit)
 * that would be silently dropped without the coercion fix.
 *
 * Requires: npm run build   (uses dist/cli.js)
 *           .env             (PHEMEX_API_KEY, PHEMEX_API_SECRET, PHEMEX_API_URL)
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("dist/cli.js");
const SYMBOL = "BTCUSDT";

let passed = 0;
let failed = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

function runCli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    execFile("node", [CLI, ...args], { env: process.env, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      res({ code: err && "code" in err ? (err.code as number) : err ? 1 : 0, stdout, stderr });
    });
  });
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

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
    console.log(`  \u2705 ${label}`);
  } else {
    failed++;
    console.log(`  \u274C ${label}${detail ? " \u2014 " + detail : ""}`);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function main() {
  // ==================================================================
  //  1. get_ticker — baseline sanity
  // ==================================================================
  {
    const r = await runCli("get_ticker", "--symbol", SYMBOL);
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("1. get_ticker", j ?? r.stderr);
    check("1. get_ticker exits 0", r.code === 0, r.stderr);
    check("   returns JSON with symbol", j?.symbol === SYMBOL);
  }

  // ==================================================================
  //  2. get_klines — integer --resolution and --limit (requireNumber / optNumber)
  // ==================================================================
  {
    const r = await runCli("get_klines", "--symbol", SYMBOL, "--resolution", "3600", "--limit", "5");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("2. get_klines (int resolution=3600, limit=5)", j ? `${(j as any)?.rows?.length ?? "?"} rows` : r.stderr);
    check("2. get_klines exits 0", r.code === 0, r.stderr);
    check("   has rows array", Array.isArray((j as any)?.rows));
    check("   rows.length > 0", ((j as any)?.rows?.length ?? 0) > 0);
  }

  // ==================================================================
  //  3. get_funding_rate — integer --limit
  // ==================================================================
  {
    const r = await runCli("get_funding_rate", "--symbol", ".BTCFR8H", "--limit", "3");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("3. get_funding_rate (int limit=3)", j ?? r.stderr);
    check("3. get_funding_rate exits 0", r.code === 0, r.stderr);
    check("   has rows", Array.isArray((j as any)?.rows));
  }

  // ==================================================================
  //  4. get_orderbook — no integer params, but validates CLI pipeline
  // ==================================================================
  {
    const r = await runCli("get_orderbook", "--symbol", SYMBOL);
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("4. get_orderbook", j ? "OK" : r.stderr);
    check("4. get_orderbook exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // ==================================================================
  //  5. get_recent_trades — no integer params, validates CLI pipeline
  //     Note: large response may be truncated by pipe buffer (process.exit
  //     doesn't wait for stdout drain), so we only check exit code + non-empty output.
  // ==================================================================
  {
    const r = await runCli("get_recent_trades", "--symbol", SYMBOL);
    log("5. get_recent_trades", r.stdout.length > 0 ? `${r.stdout.length} bytes` : r.stderr);
    check("5. get_recent_trades exits 0", r.code === 0, r.stderr);
    check("   has output", r.stdout.length > 0);
  }

  // ==================================================================
  //  ACCOUNT / READ TOOLS
  // ==================================================================

  // 6. get_account
  {
    const r = await runCli("get_account", "--symbol", SYMBOL, "--currency", "USDT");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("6. get_account", j ? "OK" : r.stderr);
    check("6. get_account exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // 7. get_positions
  {
    const r = await runCli("get_positions", "--currency", "USDT");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("7. get_positions", j ? "OK" : r.stderr);
    check("7. get_positions exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // 8. get_open_orders
  {
    const r = await runCli("get_open_orders", "--symbol", SYMBOL);
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("8. get_open_orders", j ? "OK" : r.stderr);
    check("8. get_open_orders exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // 9. get_order_history — integer --limit
  {
    const r = await runCli("get_order_history", "--symbol", SYMBOL, "--limit", "5");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("9. get_order_history (int limit=5)", j ? "OK" : r.stderr);
    check("9. get_order_history exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // 10. get_trades — integer --limit
  {
    const r = await runCli("get_trades", "--symbol", SYMBOL, "--limit", "5");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("10. get_trades (int limit=5)", j ? "OK" : r.stderr);
    check("10. get_trades exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // ==================================================================
  //  TRADING — the actual regression: integer price / orderQty
  // ==================================================================

  // Get current price from ticker for pricing the limit order
  const tickerR = await runCli("get_ticker", "--symbol", SYMBOL);
  const tickerJ = parseJson(tickerR.stdout) as Record<string, unknown> | null;
  const lastPrice = Number(tickerJ?.closeRp ?? tickerJ?.lastPrice ?? tickerJ?.close ?? 0);
  console.log(`\nCurrent BTC price: ${lastPrice}`);

  // 11. set_leverage — integer --leverage
  {
    const r = await runCli("set_leverage", "--symbol", SYMBOL, "--leverage", "20");
    const j = parseJson(r.stdout);
    log("11. set_leverage (int leverage=20)", j ?? r.stderr);
    check("11. set_leverage exits 0", r.code === 0, r.stderr);
  }

  // 12. place_order — INTEGER price (the core regression)
  let orderID: string | undefined;
  if (lastPrice > 0) {
    const intPrice = String(Math.floor(lastPrice * 0.8));
    const r = await runCli(
      "place_order",
      "--symbol", SYMBOL,
      "--side", "Buy",
      "--orderQty", "0.001",     // string decimal — goes through requireString
      "--ordType", "Limit",
      "--price", intPrice,        // INTEGER string like "76000" — coerced to number by parseCliArgs
    );
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log(`12. place_order (int price=${intPrice})`, j ?? r.stderr);
    check("12. place_order (int price) exits 0", r.code === 0, r.stderr);
    check("   has orderID", typeof j?.orderID === "string");
    orderID = j?.orderID as string | undefined;

    // 13. amend_order — INTEGER price (optString must coerce number→string)
    if (orderID) {
      const newPrice = String(Number(intPrice) - 100);
      const ra = await runCli(
        "amend_order",
        "--symbol", SYMBOL,
        "--orderID", orderID,
        "--price", newPrice,       // another integer string
        "--orderQty", "0.001",
      );
      const ja = parseJson(ra.stdout) as Record<string, unknown> | null;
      log(`13. amend_order (int price → ${newPrice})`, ja ?? ra.stderr);
      check("13. amend_order (int price) exits 0", ra.code === 0, ra.stderr);
    } else {
      check("13. amend_order (int price)", false, "no orderID from place_order");
    }

    // 14. cancel_order
    if (orderID) {
      const rc = await runCli(
        "cancel_order",
        "--symbol", SYMBOL,
        "--orderID", orderID,
      );
      const jc = parseJson(rc.stdout);
      log("14. cancel_order", jc ?? rc.stderr);
      check("14. cancel_order exits 0", rc.code === 0, rc.stderr);
    } else {
      check("14. cancel_order", false, "no orderID");
    }
  } else {
    check("12. place_order (int price)", false, "no price from ticker");
    check("13. amend_order (int price)", false, "skipped");
    check("14. cancel_order", false, "skipped");
  }

  // 15. place_order — FLOAT price (stays as string through parseCliArgs, no coercion)
  let orderID2: string | undefined;
  if (lastPrice > 0) {
    const floatPrice = (lastPrice * 0.8).toFixed(1);  // e.g. "76000.5"
    const r = await runCli(
      "place_order",
      "--symbol", SYMBOL,
      "--side", "Buy",
      "--orderQty", "0.001",
      "--ordType", "Limit",
      "--price", floatPrice,      // FLOAT string — stays as string (no coercion)
    );
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log(`15. place_order (float price=${floatPrice})`, j ?? r.stderr);
    check("15. place_order (float price) exits 0", r.code === 0, r.stderr);
    check("   has orderID", typeof j?.orderID === "string");
    orderID2 = j?.orderID as string | undefined;

    // 16. amend_order — FLOAT price
    if (orderID2) {
      const newFloatPrice = (Number(floatPrice) - 100.5).toFixed(1);
      const ra = await runCli(
        "amend_order",
        "--symbol", SYMBOL,
        "--orderID", orderID2,
        "--price", newFloatPrice,
        "--orderQty", "0.002",
      );
      const ja = parseJson(ra.stdout) as Record<string, unknown> | null;
      log(`16. amend_order (float price → ${newFloatPrice})`, ja ?? ra.stderr);
      check("16. amend_order (float price) exits 0", ra.code === 0, ra.stderr);
    } else {
      check("16. amend_order (float price)", false, "no orderID from place_order");
    }

    // 17. cancel_order
    if (orderID2) {
      const rc = await runCli(
        "cancel_order",
        "--symbol", SYMBOL,
        "--orderID", orderID2,
      );
      const jc = parseJson(rc.stdout);
      log("17. cancel_order", jc ?? rc.stderr);
      check("17. cancel_order exits 0", rc.code === 0, rc.stderr);
    } else {
      check("17. cancel_order", false, "no orderID");
    }
  } else {
    check("15. place_order (float price)", false, "no price from ticker");
    check("16. amend_order (float price)", false, "skipped");
    check("17. cancel_order", false, "skipped");
  }

  // 18. cancel_all_orders — cleanup
  {
    const r = await runCli("cancel_all_orders", "--symbol", SYMBOL);
    const j = parseJson(r.stdout);
    log("18. cancel_all_orders", j ?? r.stderr);
    check("18. cancel_all_orders exits 0", r.code === 0, r.stderr);
  }

  // 19. switch_pos_mode — Hedged then back to OneWay
  {
    const r1 = await runCli("switch_pos_mode", "--symbol", SYMBOL, "--targetPosMode", "Hedged");
    check("19. switch_pos_mode → Hedged exits 0", r1.code === 0, r1.stderr);

    if (r1.code === 0) {
      const r2 = await runCli("switch_pos_mode", "--symbol", SYMBOL, "--targetPosMode", "OneWay");
      check("   switch_pos_mode → OneWay (restore) exits 0", r2.code === 0, r2.stderr);
    }
  }

  // ==================================================================
  //  SUMMARY
  // ==================================================================
  console.log("\n" + "=".repeat(60));
  console.log(`  CLI USDT-M E2E: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
