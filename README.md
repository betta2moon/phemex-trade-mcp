# phemex-trade-mcp

MCP server for trading on [Phemex](https://phemex.com) — supports USDT-M futures, Coin-M futures, and Spot markets.

Built on the [Model Context Protocol](https://modelcontextprotocol.io), this server lets AI agents (Claude Desktop, Claude Code, or any MCP client) place orders, manage positions, check balances, and query market data on Phemex.

## Available Tools

### Market Data (public, no API key required)

| Tool | Description |
|---|---|
| `get_ticker` | 24hr price ticker for a symbol |
| `get_orderbook` | Order book snapshot (30 levels) |
| `get_klines` | Historical candlestick/kline data |
| `get_recent_trades` | Recent market trades |
| `get_funding_rate` | Funding rate history (futures only) |

### Account (read-only)

| Tool | Description |
|---|---|
| `get_account` | Futures account balance and margin info |
| `get_spot_wallet` | Spot wallet balances per currency |
| `get_positions` | Current positions with unrealized PnL (futures only) |
| `get_open_orders` | All open orders for a symbol |
| `get_order_history` | Closed/filled order history |
| `get_trades` | Trade execution history |

### Trading (write)

| Tool | Description |
|---|---|
| `place_order` | Place an order (Market, Limit, Stop, StopLimit) |
| `amend_order` | Modify price or quantity of an open order |
| `cancel_order` | Cancel a single order by orderID or clOrdID |
| `cancel_all_orders` | Cancel all open orders for a symbol |
| `set_leverage` | Set leverage for a perpetual symbol (futures only) |
| `switch_pos_mode` | Switch between OneWay and Hedged mode (USDT-M only) |

### Transfers

| Tool | Description |
|---|---|
| `transfer_funds` | Transfer funds between spot and futures wallets |
| `get_transfer_history` | Query transfer history |

### Contract Types

Every tool accepts an optional `contractType` parameter:

- **`linear`** (default) — USDT-M perpetual futures. Symbols end in `USDT` (e.g. `BTCUSDT`).
- **`inverse`** — Coin-M perpetual futures. Symbols end in `USD` (e.g. `BTCUSD`).
- **`spot`** — Spot trading. Symbols end in `USDT` (e.g. `BTCUSDT`). The server automatically prepends `s` for the API.

## Setup

### 1. Get Phemex API credentials

Create an API key at [phemex.com](https://phemex.com) (or [testnet.phemex.com](https://testnet.phemex.com) for testing).

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your keys:

```
PHEMEX_API_KEY=your-api-key
PHEMEX_API_SECRET=your-api-secret
PHEMEX_API_URL=https://testnet-api.phemex.com
PHEMEX_MAX_ORDER_VALUE=
```

| Variable | Description |
|---|---|
| `PHEMEX_API_KEY` | Your Phemex API key |
| `PHEMEX_API_SECRET` | Your Phemex API secret |
| `PHEMEX_API_URL` | API base URL. Use `https://testnet-api.phemex.com` for testnet or `https://api.phemex.com` for production |
| `PHEMEX_MAX_ORDER_VALUE` | Optional safety limit — max notional order value (USD). Orders exceeding this are rejected client-side |

### 3. Build

```bash
npm install
npm run build
```

## MCP Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "phemex": {
      "command": "node",
      "args": ["/absolute/path/to/phemex-trade-mcp/dist/index.js"],
      "env": {
        "PHEMEX_API_KEY": "your-key",
        "PHEMEX_API_SECRET": "your-secret",
        "PHEMEX_API_URL": "https://testnet-api.phemex.com"
      }
    }
  }
}
```

### Claude Code

Add to `~/.claude.json` (global) or `.mcp.json` (per-project):

```json
{
  "mcpServers": {
    "phemex": {
      "command": "node",
      "args": ["/absolute/path/to/phemex-trade-mcp/dist/index.js"],
      "env": {
        "PHEMEX_API_KEY": "your-key",
        "PHEMEX_API_SECRET": "your-secret",
        "PHEMEX_API_URL": "https://testnet-api.phemex.com"
      }
    }
  }
}
```

### OpenClaw

Install the skill from [ClawHub](https://clawhub.ai):

```bash
clawhub install phemex-trade
```

Or manually copy the `skill/phemex-trade/` directory to `~/.openclaw/skills/`.

Set your API keys as environment variables:

```bash
export PHEMEX_API_KEY=your-key
export PHEMEX_API_SECRET=your-secret
export PHEMEX_API_URL=https://api.phemex.com
```

Then ask your OpenClaw agent: "What's the current BTC price on Phemex?"

### Any MCP Client (stdio)

This server uses the **stdio** transport. Launch it as a subprocess and communicate via stdin/stdout:

```bash
PHEMEX_API_KEY=... PHEMEX_API_SECRET=... node dist/index.js
```

## Usage Examples

Once connected, ask your AI agent things like:

- "What's the current BTC price on Phemex?"
- "Show me my USDT-M account balance"
- "Place a limit buy for 0.01 BTC at $95,000"
- "What are my open positions?"
- "Cancel all open orders for ETHUSDT"
- "Show the BTCUSD Coin-M order book" (uses `contractType: "inverse"`)
- "Buy 10 USDT worth of BTC on spot" (uses `contractType: "spot"`, `qtyType: "ByQuote"`)
- "Transfer 100 USDT from spot to futures"

## Development

```bash
npm run dev       # watch mode — recompiles on file changes
npm run build     # one-time build
npm run test      # run tests
npm run start     # run the server
```

## Architecture

```
src/
  index.ts              # Server entry point — registers all tools
  client.ts             # Phemex API client (auth, signing, HTTP)
  contract-router.ts    # Routes tools to correct API endpoints per contract type
  product-info.ts       # Caches product metadata for price/qty scaling
  types.ts              # Shared types
  tools/
    get-ticker.ts       # One file per tool
    place-order.ts
    ...
```

Key design decisions:

- **Contract router** — a single `contractType` parameter on every tool dispatches to the correct Phemex API endpoint (USDT-M `/g-*`, Coin-M `/orders/*`, Spot `/spot/*`).
- **Automatic scaling** — Coin-M and Spot APIs use integer-scaled values (`priceEp`, `baseQtyEv`). The server handles conversion automatically via `ProductInfoCache`, so agents always work with human-readable decimals.
- **Symbol resolution** — Spot symbols are auto-prefixed with `s` for the API (e.g. `BTCUSDT` becomes `sBTCUSDT`). Agents don't need to know this.

## License

ISC
