---
name: phemex-trade
description: Trade on Phemex (USDT-M futures, Coin-M futures, Spot) — place orders, manage positions, check balances, and query market data.
homepage: https://github.com/betta2moon/phemex-trade-mcp
metadata:
  {
    "openclaw":
      {
        "emoji": "📈",
        "requires": { "bins": ["mcporter", "phemex-trade-mcp"], "env": ["PHEMEX_API_KEY", "PHEMEX_API_SECRET"] },
        "primaryEnv": "PHEMEX_API_KEY",
        "install":
          [
            {
              "id": "mcporter",
              "kind": "node",
              "package": "mcporter",
              "bins": ["mcporter"],
              "label": "Install mcporter (node)",
            },
            {
              "id": "phemex-trade-mcp",
              "kind": "node",
              "package": "phemex-trade-mcp",
              "bins": ["phemex-trade-mcp"],
              "label": "Install Phemex MCP server (node)",
            },
          ],
      },
  }
---

# Phemex Trading

Trade on Phemex via the phemex-trade-mcp server. Supports USDT-M futures, Coin-M futures, and Spot markets.

## How to call tools

Use mcporter to invoke tools on the phemex-trade-mcp server:

```bash
PHEMEX_API_KEY=$PHEMEX_API_KEY PHEMEX_API_SECRET=$PHEMEX_API_SECRET PHEMEX_API_URL=${PHEMEX_API_URL:-https://api.phemex.com} mcporter call --stdio "phemex-trade-mcp" <tool_name> --args '<json>' --output json
```

For read-only market data tools (get_ticker, get_orderbook, get_klines, get_recent_trades, get_funding_rate), API keys are not required:

```bash
mcporter call --stdio "phemex-trade-mcp" get_ticker --args '{"symbol":"BTCUSDT"}' --output json
```

## Contract types

Every tool accepts an optional `contractType` argument:

- `linear` (default) — USDT-M perpetual futures. Symbols end in USDT (e.g. BTCUSDT).
- `inverse` — Coin-M perpetual futures. Symbols end in USD (e.g. BTCUSD).
- `spot` — Spot trading. Symbols end in USDT (e.g. BTCUSDT). The server auto-prefixes `s` for the API.

## Tools

### Market data (no auth needed)

- `get_ticker` — 24hr price ticker. Args: `{"symbol":"BTCUSDT"}`
- `get_orderbook` — Order book (30 levels). Args: `{"symbol":"BTCUSDT"}`
- `get_klines` — Candlestick data. Args: `{"symbol":"BTCUSDT","resolution":3600,"limit":100}`
- `get_recent_trades` — Recent trades. Args: `{"symbol":"BTCUSDT"}`
- `get_funding_rate` — Funding rate history. Args: `{"symbol":".BTCFR8H","limit":20}`

### Account (read-only, auth required)

- `get_account` — Balance and margin info. Args: `{"currency":"USDT","contractType":"linear"}`
- `get_spot_wallet` — Spot wallet balances. Args: `{}`
- `get_positions` — Current positions with PnL. Args: `{"currency":"USDT","contractType":"linear"}`
- `get_open_orders` — Open orders. Args: `{"symbol":"BTCUSDT"}`
- `get_order_history` — Closed/filled orders. Args: `{"symbol":"BTCUSDT","limit":50}`
- `get_trades` — Trade execution history. Args: `{"symbol":"BTCUSDT","limit":50}`

### Trading (auth required)

- `place_order` — Place an order. Args: `{"symbol":"BTCUSDT","side":"Buy","orderQty":"0.01","ordType":"Market"}`
- `amend_order` — Modify an open order. Args: `{"symbol":"BTCUSDT","orderID":"xxx","price":"95000"}`
- `cancel_order` — Cancel one order. Args: `{"symbol":"BTCUSDT","orderID":"xxx"}`
- `cancel_all_orders` — Cancel all orders for a symbol. Args: `{"symbol":"BTCUSDT"}`
- `set_leverage` — Set leverage. Args: `{"symbol":"BTCUSDT","leverage":10}`
- `switch_pos_mode` — Switch OneWay/Hedged. Args: `{"symbol":"BTCUSDT","targetPosMode":"OneWay"}`

### Transfers (auth required)

- `transfer_funds` — Move funds between spot and futures. Args: `{"currency":"USDT","amount":"100","direction":"spot_to_futures"}`
- `get_transfer_history` — Transfer history. Args: `{"currency":"USDT","limit":20}`

## Safety rules

1. **Always confirm before placing orders.** Before calling `place_order`, show the user exactly what the order will do: symbol, side, quantity, type, price. Ask for confirmation.
2. **Always confirm before cancelling all orders.** Before calling `cancel_all_orders`, list the open orders first and confirm with the user.
3. **Explain leverage changes.** Before calling `set_leverage`, explain the implications (higher leverage = higher liquidation risk).
4. **Show context before trading.** Before suggesting a trade, show current positions and account balance so the user can make an informed decision.
5. **Never auto-trade.** Do not place orders without explicit user instruction. The user must tell you what to trade.

## Common workflows

### Check a price

```bash
mcporter call --stdio "phemex-trade-mcp" get_ticker --args '{"symbol":"BTCUSDT"}' --output json
```

### Place a market buy (USDT-M futures)

```bash
PHEMEX_API_KEY=$PHEMEX_API_KEY PHEMEX_API_SECRET=$PHEMEX_API_SECRET PHEMEX_API_URL=${PHEMEX_API_URL:-https://api.phemex.com} mcporter call --stdio "phemex-trade-mcp" place_order --args '{"symbol":"BTCUSDT","side":"Buy","orderQty":"0.01","ordType":"Market"}' --output json
```

### Place a limit sell (Coin-M futures)

```bash
PHEMEX_API_KEY=$PHEMEX_API_KEY PHEMEX_API_SECRET=$PHEMEX_API_SECRET PHEMEX_API_URL=${PHEMEX_API_URL:-https://api.phemex.com} mcporter call --stdio "phemex-trade-mcp" place_order --args '{"symbol":"BTCUSD","side":"Sell","orderQty":"10","ordType":"Limit","price":"100000","contractType":"inverse"}' --output json
```

### Buy spot

```bash
PHEMEX_API_KEY=$PHEMEX_API_KEY PHEMEX_API_SECRET=$PHEMEX_API_SECRET PHEMEX_API_URL=${PHEMEX_API_URL:-https://api.phemex.com} mcporter call --stdio "phemex-trade-mcp" place_order --args '{"symbol":"BTCUSDT","side":"Buy","orderQty":"10","ordType":"Market","contractType":"spot","qtyType":"ByQuote"}' --output json
```

### Check positions

```bash
PHEMEX_API_KEY=$PHEMEX_API_KEY PHEMEX_API_SECRET=$PHEMEX_API_SECRET PHEMEX_API_URL=${PHEMEX_API_URL:-https://api.phemex.com} mcporter call --stdio "phemex-trade-mcp" get_positions --args '{"currency":"USDT"}' --output json
```

## Setup

1. Create a Phemex account at https://phemex.com
2. Create an API key (Account → API Management)
3. Set environment variables `PHEMEX_API_KEY` and `PHEMEX_API_SECRET`
4. Optionally set `PHEMEX_API_URL` (defaults to `https://api.phemex.com` for production; use `https://testnet-api.phemex.com` for testing)
5. Optionally set `PHEMEX_MAX_ORDER_VALUE` to limit maximum order size (USD)
