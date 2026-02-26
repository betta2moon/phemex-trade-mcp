/**
 * CLI E2E test — Spot endpoints.
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
const SYMBOL = "SOLUSDT";  // user-facing symbol (CLI resolves to sSOLUSDT internally)
const CT = "spot";

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
  //  MARKET DATA — integer params via CLI
  // ==================================================================

  // 1. get_ticker
  {
    const r = await runCli("get_ticker", "--symbol", SYMBOL, "--contractType", CT);
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("1. get_ticker (spot)", j ?? r.stderr);
    check("1. get_ticker exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // 2. get_klines — integer --resolution and --limit
  {
    const r = await runCli("get_klines", "--symbol", SYMBOL, "--contractType", CT, "--resolution", "3600", "--limit", "5");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("2. get_klines (int resolution=3600, limit=5)", j ? `${(j as any)?.rows?.length ?? "?"} rows` : r.stderr);
    check("2. get_klines exits 0", r.code === 0, r.stderr);
    check("   has rows array", Array.isArray((j as any)?.rows));
  }

  // 3. get_orderbook
  {
    const r = await runCli("get_orderbook", "--symbol", SYMBOL, "--contractType", CT);
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("3. get_orderbook", j ? "OK" : r.stderr);
    check("3. get_orderbook exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // 4. get_recent_trades
  //    Note: large response may be truncated by pipe buffer (process.exit
  //    doesn't wait for stdout drain), so we only check exit code + non-empty output.
  {
    const r = await runCli("get_recent_trades", "--symbol", SYMBOL, "--contractType", CT);
    log("4. get_recent_trades", r.stdout.length > 0 ? `${r.stdout.length} bytes` : r.stderr);
    check("4. get_recent_trades exits 0", r.code === 0, r.stderr);
    check("   has output", r.stdout.length > 0);
  }

  // ==================================================================
  //  ACCOUNT / READ TOOLS
  // ==================================================================

  // 5. get_spot_wallet
  {
    const r = await runCli("get_spot_wallet");
    const j = parseJson(r.stdout);
    log("5. get_spot_wallet", j ? "OK" : r.stderr);
    check("5. get_spot_wallet exits 0", r.code === 0, r.stderr);
    check("   returns JSON array", Array.isArray(j));
  }

  // 6. get_open_orders
  {
    const r = await runCli("get_open_orders", "--symbol", SYMBOL, "--contractType", CT);
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("6. get_open_orders (spot)", j ? "OK" : r.stderr);
    check("6. get_open_orders exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // 7. get_order_history — integer --limit
  {
    const r = await runCli("get_order_history", "--symbol", SYMBOL, "--contractType", CT, "--limit", "5");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("7. get_order_history (int limit=5)", j ? "OK" : r.stderr);
    check("7. get_order_history exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // 8. get_trades — integer --limit
  {
    const r = await runCli("get_trades", "--symbol", SYMBOL, "--contractType", CT, "--limit", "5");
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("8. get_trades (int limit=5)", j ? "OK" : r.stderr);
    check("8. get_trades exits 0", r.code === 0, r.stderr);
    check("   returns JSON", j !== null);
  }

  // ==================================================================
  //  TRADING — integer price / orderQty through CLI
  // ==================================================================

  // Fund spot wallet first (transfer 2 USDT from futures)
  {
    const r = await runCli("transfer_funds", "--currency", "USDT", "--amount", "2", "--direction", "futures_to_spot");
    const j = parseJson(r.stdout);
    if (r.code === 0) {
      console.log("\n  Funded spot wallet with 2 USDT");
    } else {
      console.log("\n  Could not transfer from futures \u2014 using existing spot balance");
    }
  }

  // 9. place_order — INTEGER price (coerced to number by parseCliArgs)
  {
    const r = await runCli(
      "place_order",
      "--symbol", SYMBOL,
      "--contractType", CT,
      "--side", "Buy",
      "--orderQty", "0.1",        // 0.1 SOL * $15 = $1.50, above $1 min order value
      "--ordType", "Limit",
      "--price", "15",             // INTEGER price — coerced to number by parseCliArgs
    );
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("9. place_order (int price=15)", j ?? r.stderr);
    check("9. place_order (int price) exits 0", r.code === 0, r.stderr);
    check("   has orderID", typeof j?.orderID === "string");

    const spotOrderID = j?.orderID as string | undefined;

    // 10. amend_order — INTEGER price
    if (spotOrderID) {
      const ra = await runCli(
        "amend_order",
        "--symbol", SYMBOL,
        "--contractType", CT,
        "--orderID", spotOrderID,
        "--price", "14",           // integer price
      );
      const ja = parseJson(ra.stdout) as Record<string, unknown> | null;
      log("10. amend_order (int price -> 14)", ja ?? ra.stderr);
      check("10. amend_order (int price) exits 0", ra.code === 0, ra.stderr);
    } else {
      check("10. amend_order (int price)", false, "no orderID from place_order");
    }

    // 11. cancel_order
    if (spotOrderID) {
      const rc = await runCli(
        "cancel_order",
        "--symbol", SYMBOL,
        "--contractType", CT,
        "--orderID", spotOrderID,
      );
      const jc = parseJson(rc.stdout);
      log("11. cancel_order", jc ?? rc.stderr);
      check("11. cancel_order exits 0", rc.code === 0, rc.stderr);
    } else {
      check("11. cancel_order", false, "no orderID");
    }
  }

  // 12. place_order — FLOAT price (stays as string, no coercion)
  {
    const r = await runCli(
      "place_order",
      "--symbol", SYMBOL,
      "--contractType", CT,
      "--side", "Buy",
      "--orderQty", "0.1",
      "--ordType", "Limit",
      "--price", "15.50",          // FLOAT price — stays as string
    );
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("12. place_order (float price=15.50)", j ?? r.stderr);
    check("12. place_order (float price) exits 0", r.code === 0, r.stderr);
    check("   has orderID", typeof j?.orderID === "string");

    const spotOrderID2 = j?.orderID as string | undefined;

    // 13. amend_order — FLOAT price
    if (spotOrderID2) {
      const ra = await runCli(
        "amend_order",
        "--symbol", SYMBOL,
        "--contractType", CT,
        "--orderID", spotOrderID2,
        "--price", "14.75",        // float price
      );
      const ja = parseJson(ra.stdout) as Record<string, unknown> | null;
      log("13. amend_order (float price -> 14.75)", ja ?? ra.stderr);
      check("13. amend_order (float price) exits 0", ra.code === 0, ra.stderr);
    } else {
      check("13. amend_order (float price)", false, "no orderID from place_order");
    }

    // 14. cancel_order
    if (spotOrderID2) {
      const rc = await runCli(
        "cancel_order",
        "--symbol", SYMBOL,
        "--contractType", CT,
        "--orderID", spotOrderID2,
      );
      const jc = parseJson(rc.stdout);
      log("14. cancel_order", jc ?? rc.stderr);
      check("14. cancel_order exits 0", rc.code === 0, rc.stderr);
    } else {
      check("14. cancel_order", false, "no orderID");
    }
  }

  // 15. cancel_all_orders — cleanup
  {
    const r = await runCli("cancel_all_orders", "--symbol", SYMBOL, "--contractType", CT);
    const j = parseJson(r.stdout);
    log("15. cancel_all_orders (spot)", j ?? r.stderr);
    check("15. cancel_all_orders exits 0", r.code === 0, r.stderr);
  }

  // Cleanup: transfer USDT back to futures
  {
    const r = await runCli("transfer_funds", "--currency", "USDT", "--amount", "2", "--direction", "spot_to_futures");
    if (r.code === 0) {
      console.log("\n  Transferred USDT back to futures");
    }
  }

  // ==================================================================
  //  SUMMARY
  // ==================================================================
  console.log("\n" + "=".repeat(60));
  console.log(`  CLI SPOT E2E: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
