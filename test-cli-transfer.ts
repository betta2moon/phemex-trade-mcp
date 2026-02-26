/**
 * CLI E2E test — Transfer endpoints.
 *
 * Spawns `node dist/cli.js` as a child process, verifying the full pipeline:
 *   CLI args → parseCliArgs → param-helpers → API call → JSON output
 *
 * Focus: integer AND float CLI params (--amount, --limit) that would be
 * silently dropped without the coercion fix.
 *
 * Requires: npm run build   (uses dist/cli.js)
 *           .env             (PHEMEX_API_KEY, PHEMEX_API_SECRET, PHEMEX_API_URL)
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("dist/cli.js");
const CURRENCY = "USDT";
const AMOUNT = "1";  // 1 USDT — small enough to be safe

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
  //  1. transfer_funds: Futures → Spot  (INTEGER amount via CLI)
  //     --amount 1 is coerced to number by parseCliArgs;
  //     requireString must coerce it back to "1"
  // ==================================================================
  {
    const r = await runCli(
      "transfer_funds",
      "--currency", CURRENCY,
      "--amount", AMOUNT,          // integer string — coerced to number
      "--direction", "futures_to_spot",
    );
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("1. transfer futures \u2192 spot (int amount=1)", j ?? r.stderr);
    check("1. transfer futures \u2192 spot exits 0", r.code === 0, r.stderr);
    if (j) {
      check("   has amount field", j.amount !== undefined || j.amountEv !== undefined);
      check("   has statusText", typeof j.statusText === "string");
    }
  }

  // Wait for transfer to settle
  await new Promise(r => setTimeout(r, 1000));

  // ==================================================================
  //  2. transfer_funds: Spot → Futures (move it back)
  // ==================================================================
  {
    const r = await runCli(
      "transfer_funds",
      "--currency", CURRENCY,
      "--amount", AMOUNT,
      "--direction", "spot_to_futures",
    );
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("2. transfer spot \u2192 futures (int amount=1)", j ?? r.stderr);
    check("2. transfer spot \u2192 futures exits 0", r.code === 0, r.stderr);
    if (j) {
      check("   has statusText", typeof j.statusText === "string");
    }
  }

  await new Promise(r => setTimeout(r, 1000));

  // ==================================================================
  //  3. transfer_funds: FLOAT amount — Futures → Spot then back
  //     --amount 0.5 stays as string (no coercion by parseCliArgs)
  // ==================================================================
  {
    const r = await runCli(
      "transfer_funds",
      "--currency", CURRENCY,
      "--amount", "0.5",           // FLOAT — stays as string, no coercion
      "--direction", "futures_to_spot",
    );
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("3. transfer futures -> spot (float amount=0.5)", j ?? r.stderr);
    check("3. transfer (float amount) exits 0", r.code === 0, r.stderr);
    if (j) {
      check("   has statusText", typeof j.statusText === "string");
    }
  }

  await new Promise(r => setTimeout(r, 1000));

  // Transfer the float amount back
  {
    const r = await runCli(
      "transfer_funds",
      "--currency", CURRENCY,
      "--amount", "0.5",
      "--direction", "spot_to_futures",
    );
    const j = parseJson(r.stdout) as Record<string, unknown> | null;
    log("4. transfer spot -> futures (float amount=0.5)", j ?? r.stderr);
    check("4. transfer back (float amount) exits 0", r.code === 0, r.stderr);
  }

  await new Promise(r => setTimeout(r, 1000));

  // ==================================================================
  //  5. get_transfer_history (both directions) — integer --limit
  // ==================================================================
  {
    const r = await runCli(
      "get_transfer_history",
      "--currency", CURRENCY,
      "--limit", "5",             // integer — optNumber
    );
    const j = parseJson(r.stdout);
    log("5. get_transfer_history (int limit=5)", j ? `${Array.isArray(j) ? j.length : "?"} records` : r.stderr);
    check("5. get_transfer_history exits 0", r.code === 0, r.stderr);
    check("   returns JSON array", Array.isArray(j));
    check("   has records", Array.isArray(j) && j.length > 0);
  }

  // ==================================================================
  //  6. get_transfer_history with direction filter
  // ==================================================================
  {
    const r = await runCli(
      "get_transfer_history",
      "--currency", CURRENCY,
      "--direction", "futures_to_spot",
      "--limit", "3",
    );
    const j = parseJson(r.stdout);
    log("6. get_transfer_history (futures_to_spot, limit=3)", j ? `${Array.isArray(j) ? j.length : "?"} records` : r.stderr);
    check("6. get_transfer_history (filtered) exits 0", r.code === 0, r.stderr);
    check("   returns JSON array", Array.isArray(j));
  }

  // ==================================================================
  //  SUMMARY
  // ==================================================================
  console.log("\n" + "=".repeat(60));
  console.log(`  CLI TRANSFER E2E: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
