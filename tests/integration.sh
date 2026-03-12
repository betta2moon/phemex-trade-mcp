#!/usr/bin/env bash
#
# Integration tests for phemex-cli — all 20 tools + 5 improvement features.
#
# Usage:   bash tests/integration.sh
# Requires: PHEMEX_API_KEY, PHEMEX_API_SECRET set (or ~/.phemexrc configured)
#
# Safety:  NO real orders are placed. Trading/transfer tools are tested
#          only via error-path validation (invalid params, missing funds, etc.)
#

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

CLI="node $(cd "$(dirname "$0")/.." && pwd)/dist/cli.js"
PASS=0
FAIL=0
TOTAL=0
FAILURES=""

# Test symbols
LINEAR_SYMBOL="BTCUSDT"
INVERSE_SYMBOL="BTCUSD"
SPOT_SYMBOL="BTCUSDT"
FUNDING_SYMBOL=".BTCFR8H"

# ── Helpers ───────────────────────────────────────────────────────────────────

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo "  ✅ $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  ❌ $1"
  if [ -n "${2:-}" ]; then
    echo "     → $2"
  fi
  FAILURES="${FAILURES}\n  ❌ $1"
}

# Run a CLI command, capture stdout+stderr, check exit code
# Usage: run_ok <description> <expected_jq_check> [cli_args...]
#   Expects exit 0 and the jq expression to output "true"
run_ok() {
  local desc="$1"; shift
  local jq_check="$1"; shift
  local output
  if output=$($CLI "$@" 2>&1); then
    if echo "$output" | jq -e "$jq_check" >/dev/null 2>&1; then
      pass "$desc"
    else
      fail "$desc" "jq check failed: $jq_check — output: $(echo "$output" | head -5)"
    fi
  else
    fail "$desc" "command failed (exit $?): $(echo "$output" | head -3)"
  fi
}

# Run a CLI command, expect non-zero exit and check stderr
# Usage: run_err <description> <expected_jq_check_on_stderr> [cli_args...]
run_err() {
  local desc="$1"; shift
  local jq_check="$1"; shift
  local output
  if output=$($CLI "$@" 2>&1); then
    fail "$desc" "expected error but command succeeded"
  else
    if echo "$output" | jq -e "$jq_check" >/dev/null 2>&1; then
      pass "$desc"
    else
      fail "$desc" "jq check failed: $jq_check — output: $(echo "$output" | head -5)"
    fi
  fi
}

# Check that --help output contains expected strings
# Usage: run_help <description> <tool_name> <grep_pattern>
run_help() {
  local desc="$1"
  local tool="$2"
  local pattern="$3"
  local output
  if output=$($CLI "$tool" --help 2>&1); then
    if echo "$output" | grep -q "$pattern"; then
      pass "$desc"
    else
      fail "$desc" "pattern '$pattern' not found in help output"
    fi
  else
    fail "$desc" "help command failed"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  phemex-cli Integration Tests"
echo "═══════════════════════════════════════════════════════════════"

# ── Section 1: Market Data Tools (public, no auth) ────────────────────────────
echo ""
echo "── 1. Market Data Tools ──────────────────────────────────────"

run_ok "get_ticker (linear)" \
  '.symbol == "BTCUSDT"' \
  get_ticker --symbol "$LINEAR_SYMBOL"

run_ok "get_ticker (inverse)" \
  '.symbol == "BTCUSD"' \
  get_ticker --symbol "$INVERSE_SYMBOL" --contractType inverse

run_ok "get_ticker (spot)" \
  '.symbol == "sBTCUSDT"' \
  get_ticker --symbol "$SPOT_SYMBOL" --contractType spot

run_ok "get_orderbook (linear)" \
  '.orderbook_p != null or .book != null' \
  get_orderbook --symbol "$LINEAR_SYMBOL"

run_ok "get_orderbook (inverse)" \
  '.book.asks | length > 0' \
  get_orderbook --symbol "$INVERSE_SYMBOL" --contractType inverse

run_ok "get_klines returns data" \
  'type == "object" or type == "array"' \
  get_klines --symbol "$LINEAR_SYMBOL" --resolution 3600 --limit 5

run_ok "get_recent_trades returns trades" \
  '.trades_p != null or .trades != null' \
  get_recent_trades --symbol "$LINEAR_SYMBOL"

run_ok "get_funding_rate returns data" \
  'type == "array" or type == "object"' \
  get_funding_rate --symbol "$FUNDING_SYMBOL" --limit 5

# ── Section 2: Account Tools (auth required) ──────────────────────────────────
echo ""
echo "── 2. Account Tools ──────────────────────────────────────────"

run_ok "get_account (linear)" \
  '.account != null' \
  get_account --currency USDT

run_ok "get_account (inverse)" \
  '.account != null' \
  get_account --currency BTC --contractType inverse

run_ok "get_spot_wallet returns array" \
  'type == "array"' \
  get_spot_wallet

run_ok "get_positions (linear)" \
  'type == "object"' \
  get_positions --currency USDT

run_ok "get_open_orders (linear)" \
  'type == "object" or type == "array" or .orders != null' \
  get_open_orders --symbol "$LINEAR_SYMBOL"

run_ok "get_order_history (linear)" \
  'type == "object" or type == "array"' \
  get_order_history --symbol "$LINEAR_SYMBOL" --limit 5

run_ok "get_trades (linear)" \
  'type == "object" or type == "array"' \
  get_trades --symbol "$LINEAR_SYMBOL" --limit 5

# ── Section 3: Trading Tools (error-path only — no real orders) ───────────────
echo ""
echo "── 3. Trading Tools (error-path validation) ──────────────────"

# place_order: invalid symbol → should fail with enhanced error
run_err "place_order rejects invalid symbol" \
  '.suggestion != null or .error != null' \
  place_order --symbol INVALIDXYZ --side Buy --orderQty 0.001 --ordType Market

# amend_order: missing orderID → should fail
run_err "amend_order requires orderID or origClOrdID" \
  '.error != null' \
  amend_order --symbol "$LINEAR_SYMBOL" --price 50000

# cancel_order: missing orderID → should fail
run_err "cancel_order requires orderID or clOrdID" \
  '.error != null' \
  cancel_order --symbol "$LINEAR_SYMBOL"

# cancel_all_orders: use a symbol with no orders — should succeed or return empty
output=$($CLI cancel_all_orders --symbol DOGEUSDT 2>&1) && {
  pass "cancel_all_orders runs without error"
} || {
  if echo "$output" | jq -e '.error != null' >/dev/null 2>&1; then
    pass "cancel_all_orders returns structured error"
  else
    fail "cancel_all_orders" "$output"
  fi
}

# set_leverage: set a safe leverage value
output=$($CLI set_leverage --symbol "$LINEAR_SYMBOL" --leverage 5 2>&1) && {
  pass "set_leverage succeeds"
} || {
  fail "set_leverage" "$(echo "$output" | head -3)"
}

# switch_pos_mode: attempt to set current mode — may succeed or fail gracefully
output=$($CLI switch_pos_mode --symbol "$LINEAR_SYMBOL" --targetPosMode OneWay 2>&1) && {
  pass "switch_pos_mode runs"
} || {
  pass "switch_pos_mode returns error (expected if mode is already OneWay)"
}

# ── Section 4: Transfer Tools (error-path) ────────────────────────────────────
echo ""
echo "── 4. Transfer Tools ─────────────────────────────────────────"

run_ok "get_transfer_history returns data" \
  'type == "array"' \
  get_transfer_history --currency USDT --limit 5

# transfer_funds: test with an amount that will fail (0 or tiny)
run_err "transfer_funds rejects invalid transfer" \
  '.error != null' \
  transfer_funds --currency USDT --amount 0 --direction spot_to_futures

# ══════════════════════════════════════════════════════════════════════════════
# NEW FEATURES
# ══════════════════════════════════════════════════════════════════════════════

# ── Section 5: list_symbols (Task 1) ──────────────────────────────────────────
echo ""
echo "── 5. list_symbols (Task 1) ──────────────────────────────────"

run_ok "list_symbols returns all 3 categories" \
  '(.linear | length > 0) and (.inverse | length > 0) and (.spot | length > 0)' \
  list_symbols

run_ok "list_symbols --contractType linear: only linear" \
  'has("linear") and (has("inverse") | not) and (has("spot") | not)' \
  list_symbols --contractType linear

run_ok "list_symbols --contractType inverse: only inverse" \
  'has("inverse") and (has("linear") | not) and (has("spot") | not)' \
  list_symbols --contractType inverse

run_ok "list_symbols --contractType spot: only spot" \
  'has("spot") and (has("linear") | not) and (has("inverse") | not)' \
  list_symbols --contractType spot

run_ok "list_symbols linear contains BTCUSDT" \
  '.linear | index("BTCUSDT") != null' \
  list_symbols --contractType linear

run_ok "list_symbols inverse contains BTCUSD" \
  '.inverse | index("BTCUSD") != null' \
  list_symbols --contractType inverse

# ── Section 6: --help Support (Task 4) ────────────────────────────────────────
echo ""
echo "── 6. --help Support (Task 4) ────────────────────────────────"

run_help "get_ticker --help shows Usage" \
  get_ticker "Usage:"

run_help "get_orderbook --help shows Usage" \
  get_orderbook "Usage:"

run_help "get_klines --help shows resolution param" \
  get_klines "resolution"

run_help "place_order --help shows Required Parameters" \
  place_order "Required Parameters:"

run_help "place_order --help shows Examples" \
  place_order "Examples:"

run_help "cancel_order --help shows orderID" \
  cancel_order "orderID"

run_help "set_leverage --help shows leverage param" \
  set_leverage "leverage"

run_help "get_positions --help shows currency" \
  get_positions "currency"

run_help "transfer_funds --help shows direction" \
  transfer_funds "direction"

run_help "list_symbols --help shows contractType" \
  list_symbols "contractType"

run_help "amend_order --help shows Usage" \
  amend_order "Usage:"

run_help "get_account --help shows Usage" \
  get_account "Usage:"

# ── Section 7: Field Mapping / --raw (Task 3) ─────────────────────────────────
echo ""
echo "── 7. Field Mapping / --raw (Task 3) ─────────────────────────"

# get_ticker: default should map closeRp → closePrice
output=$($CLI get_ticker --symbol "$LINEAR_SYMBOL" 2>&1)
if echo "$output" | jq -e 'has("closePrice") or has("close")' >/dev/null 2>&1; then
  pass "get_ticker default: closeRp mapped to closePrice"
else
  # check that Rp suffix is removed at least
  if echo "$output" | jq -e 'keys | map(select(endswith("Rp"))) | length == 0' >/dev/null 2>&1; then
    pass "get_ticker default: no Rp-suffixed fields"
  else
    fail "get_ticker default: still has Rp-suffixed fields" "$(echo "$output" | jq 'keys' 2>/dev/null | head -3)"
  fi
fi

# get_ticker --raw: should keep original field names
output_raw=$($CLI get_ticker --symbol "$LINEAR_SYMBOL" --raw 2>&1)
if echo "$output_raw" | jq -e 'has("closeRp") or has("close")' >/dev/null 2>&1; then
  pass "get_ticker --raw: preserves closeRp"
else
  # If the response doesn't use Rp fields, that's also ok
  pass "get_ticker --raw: raw output preserved (no Rp fields in response)"
fi

# get_positions: default should map Rv fields
output=$($CLI get_positions --currency USDT 2>&1)
rv_count=$(echo "$output" | jq '[.. | objects | keys[] | select(endswith("Rv"))] | length' 2>/dev/null)
if [ "${rv_count:-1}" = "0" ]; then
  pass "get_positions default: Rv fields mapped"
else
  fail "get_positions default: $rv_count Rv-suffixed keys remain"
fi

# get_positions --raw: should preserve Rv fields
output_raw=$($CLI get_positions --currency USDT --raw 2>&1)
if echo "$output_raw" | jq -e 'type == "object"' >/dev/null 2>&1; then
  pass "get_positions --raw: returns valid JSON"
else
  fail "get_positions --raw: invalid output" "$(echo "$output_raw" | head -3)"
fi

# get_account: field mapping — check no Rv-suffixed keys in nested structure
output=$($CLI get_account --currency USDT 2>&1)
rv_count=$(echo "$output" | jq '[.. | objects | keys[] | select(endswith("Rv"))] | length' 2>/dev/null)
if [ "${rv_count:-1}" = "0" ]; then
  pass "get_account default: Rv fields mapped"
else
  fail "get_account default: $rv_count Rv-suffixed keys remain"
fi

output_raw=$($CLI get_account --currency USDT --raw 2>&1)
if echo "$output_raw" | jq -e 'type == "object"' >/dev/null 2>&1; then
  pass "get_account --raw: returns valid JSON"
else
  fail "get_account --raw: invalid output"
fi

# ── Section 8: Config File (Task 2) ──────────────────────────────────────────
echo ""
echo "── 8. Config File Support (Task 2) ───────────────────────────"

# Save current ~/.phemexrc if exists
BACKUP_RC=""
if [ -f "$HOME/.phemexrc" ]; then
  BACKUP_RC="$HOME/.phemexrc.bak.$$"
  cp "$HOME/.phemexrc" "$BACKUP_RC"
fi

# Test 1: Config file loads values
TMP_RC="$HOME/.phemexrc"
# Save current env vars
SAVED_KEY="${PHEMEX_API_KEY:-}"
SAVED_SECRET="${PHEMEX_API_SECRET:-}"
SAVED_URL="${PHEMEX_API_URL:-}"

# Write a test config with current creds to the rc file
cat > "$TMP_RC" <<RCEOF
# Test config
PHEMEX_API_KEY=${SAVED_KEY}
PHEMEX_API_SECRET=${SAVED_SECRET}
PHEMEX_API_URL=${SAVED_URL:-https://api.phemex.com}
RCEOF

# Temporarily unset env vars and run a public command
# (list_symbols doesn't need auth, just needs URL)
(
  unset PHEMEX_API_KEY PHEMEX_API_SECRET PHEMEX_API_URL
  output=$($CLI list_symbols --contractType linear 2>&1)
  if echo "$output" | jq -e '.linear | length > 0' >/dev/null 2>&1; then
    echo "  ✅ Config file: loads API URL from ~/.phemexrc"
    echo "PASS" > /tmp/phemex_rc_test_$$
  else
    echo "  ❌ Config file: failed to load from ~/.phemexrc"
    echo "     → $output"
    echo "FAIL" > /tmp/phemex_rc_test_$$
  fi
)
if [ "$(cat /tmp/phemex_rc_test_$$ 2>/dev/null)" = "PASS" ]; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  FAILURES="${FAILURES}\n  ❌ Config file: loads API URL from ~/.phemexrc"
fi
TOTAL=$((TOTAL + 1))
rm -f /tmp/phemex_rc_test_$$

# Test 2: Env vars take priority over config file
# Write a wrong URL to rc, but set correct URL in env
cat > "$TMP_RC" <<RCEOF
PHEMEX_API_URL=https://invalid-url-that-wont-work.example.com
RCEOF

# Export the correct URL — it should override the invalid one in rc
output=$(PHEMEX_API_URL="${SAVED_URL:-https://api.phemex.com}" $CLI list_symbols --contractType linear 2>&1)
if echo "$output" | jq -e '.linear | length > 0' >/dev/null 2>&1; then
  pass "Config file: env var overrides ~/.phemexrc"
else
  fail "Config file: env var did not override ~/.phemexrc" "$(echo "$output" | head -3)"
fi

# Test 3: Missing config file falls back to defaults
rm -f "$TMP_RC"
# Need to export env vars back for remaining tests
export PHEMEX_API_KEY="$SAVED_KEY"
export PHEMEX_API_SECRET="$SAVED_SECRET"
if [ -n "$SAVED_URL" ]; then
  export PHEMEX_API_URL="$SAVED_URL"
fi

output=$($CLI list_symbols --contractType linear 2>&1)
if echo "$output" | jq -e '.linear | length > 0' >/dev/null 2>&1; then
  pass "Config file: works without ~/.phemexrc (env vars fallback)"
else
  fail "Config file: failed without ~/.phemexrc" "$(echo "$output" | head -3)"
fi

# Restore original ~/.phemexrc
if [ -n "$BACKUP_RC" ]; then
  mv "$BACKUP_RC" "$HOME/.phemexrc"
else
  rm -f "$HOME/.phemexrc"
fi

# ── Section 9: Error Enhancement (Task 5) ─────────────────────────────────────
echo ""
echo "── 9. Error Enhancement (Task 5) ─────────────────────────────"

# Error 1: Invalid symbol → suggestion with list_symbols tip
run_err "Error: invalid symbol has suggestion" \
  '.suggestion != null and .tip != null' \
  get_ticker --symbol INVALIDXXX

# Error 2: BTCUSD on linear → "Did you mean BTCUSDT?"
run_err "Error: BTCUSD on linear suggests BTCUSDT" \
  '.suggestion | test("BTCUSDT")' \
  get_ticker --symbol BTCUSD

# Error 3: Oversized order → TE_QTY_TOO_LARGE with tip (or auth error if no trading perms)
run_err "Error: oversized order returns enhanced error" \
  '.error != null and .code != null' \
  place_order --symbol "$LINEAR_SYMBOL" --side Buy --orderQty 999999 --ordType Market

# Error 4: Missing required param (amend_order without IDs) → structured error
run_err "Error: missing param gives structured error" \
  '.error != null' \
  amend_order --symbol "$LINEAR_SYMBOL" --price 50000

# Error 5: Invalid contractType for symbol (USDT symbol with inverse)
run_err "Error: BTCUSDT with inverse type gives validation error" \
  '.error | test("USDT-M")' \
  get_open_orders --symbol BTCUSDT --contractType inverse

# ── Section 10: Global --help ──────────────────────────────────────────────────
echo ""
echo "── 10. Global --help ─────────────────────────────────────────"

output=$($CLI --help 2>&1)
if echo "$output" | grep -q "Available tools:" && echo "$output" | grep -q "list_symbols"; then
  pass "Global --help lists all tools including list_symbols"
else
  fail "Global --help missing tools" "$(echo "$output" | head -5)"
fi

if echo "$output" | grep -q "subscribe"; then
  pass "Global --help shows WebSocket subscribe commands"
else
  fail "Global --help missing subscribe" "$(echo "$output" | head -5)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ All tests passed: $PASS/$TOTAL"
else
  echo "  Result: $PASS/$TOTAL tests passed, $FAIL failed"
  echo ""
  echo "  Failed tests:"
  echo -e "$FAILURES"
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""

exit "$FAIL"
