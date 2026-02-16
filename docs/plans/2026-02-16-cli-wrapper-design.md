# CLI Wrapper for OpenClaw Skill — Design

**Date:** 2026-02-16
**Goal:** Replace the mcporter bridge with a direct CLI wrapper (`phemex-cli`) for the OpenClaw skill, while preserving the existing MCP server for native MCP clients.

## Problem

The current OpenClaw skill uses `mcporter call --stdio "phemex-trade-mcp" <tool>` to invoke MCP tools. This has three issues:

1. **Two dependencies** — requires both `mcporter` and `phemex-trade-mcp` npm packages
2. **Verbose commands** — each invocation is ~200 characters including inline env vars
3. **Cold start overhead** — mcporter spawns a new MCP server process per call, including MCP handshake and product cache initialization

## Approach

Add a thin CLI entry point (`phemex-cli`) to the existing `phemex-trade-mcp` package. The CLI reuses `client.ts`, `product-info.ts`, and `contract-router.ts` — it's just a different input/output wrapper around the same core logic.

## CLI Interface

```bash
phemex-cli <tool_name> [--flag value ...] | ['{json}']
```

Supports two arg styles per call (not mixed):

**Flag style:**
```bash
phemex-cli get_ticker --symbol BTCUSDT
phemex-cli place_order --symbol BTCUSDT --side Buy --orderQty 0.01 --ordType Market
phemex-cli get_positions --currency USDT --contractType linear
```

**JSON style:**
```bash
phemex-cli get_ticker '{"symbol":"BTCUSDT"}'
phemex-cli place_order '{"symbol":"BTCUSDT","side":"Buy","orderQty":"0.01","ordType":"Market"}'
```

**Auth:** reads `PHEMEX_API_KEY`, `PHEMEX_API_SECRET`, `PHEMEX_API_URL` from environment (inherited from OpenClaw config).

**Output:** always JSON to stdout. Errors print JSON with an `error` field and exit code 1.

## Architecture

```
src/
  index.ts              # MCP server entry point (unchanged)
  cli.ts                # NEW — CLI entry point
  cli-parser.ts         # NEW — arg parsing (flags + JSON → params object)
  client.ts             # Phemex API client (shared)
  contract-router.ts    # Routes to correct endpoints (shared)
  product-info.ts       # Product metadata cache (shared)
  types.ts              # Shared types
  tools/                # Tool handlers (shared, unchanged)
```

**package.json bin entries:**
```json
{
  "bin": {
    "phemex-trade-mcp": "./dist/index.js",
    "phemex-cli": "./dist/cli.js"
  }
}
```

### cli-parser.ts

Detects arg style:
- If first non-subcommand arg starts with `{` → parse as JSON
- If first non-subcommand arg starts with `--` → parse flag pairs into key-value object
- Numeric strings that look like numbers get coerced (for `leverage`, `limit`, etc.)

### cli.ts

1. Parse subcommand name from `process.argv[2]`
2. Parse args via `cli-parser.ts`
3. Initialize `PhemexClient` and `ProductInfoCache`
4. Dispatch to the matching tool handler
5. Print result JSON to stdout, exit 0
6. On error, print error JSON to stderr, exit 1

Each tool handler already returns a result object — the CLI just JSON.stringify's it.

## Updated SKILL.md

**Metadata changes:**
- Remove `mcporter` from `requires.bins` and `install`
- Change binary to `phemex-cli`

**Invocation pattern changes:**
```bash
# Before (mcporter)
PHEMEX_API_KEY=$PHEMEX_API_KEY PHEMEX_API_SECRET=$PHEMEX_API_SECRET PHEMEX_API_URL=${PHEMEX_API_URL:-https://api.phemex.com} mcporter call --stdio "phemex-trade-mcp" get_ticker --args '{"symbol":"BTCUSDT"}' --output json

# After (CLI)
phemex-cli get_ticker --symbol BTCUSDT
```

Env vars are inherited from OpenClaw config — no inline passing needed.

**Implementation note:** Use `skill-creator` skill as reference when writing the updated SKILL.md to follow OpenClaw best practices.

## Deliverables

1. `src/cli.ts` — CLI entry point
2. `src/cli-parser.ts` — argument parser
3. Updated `package.json` — dual bin entries
4. Updated `skill/phemex-trade/SKILL.md` — uses `phemex-cli` instead of `mcporter`
5. Updated `README.md` — document CLI usage

## What Doesn't Change

- `src/index.ts` (MCP server) — untouched
- `src/client.ts`, `src/product-info.ts`, `src/contract-router.ts` — untouched
- All `src/tools/*.ts` — untouched
- Claude Desktop / Claude Code MCP configuration — still works via `phemex-trade-mcp` binary
