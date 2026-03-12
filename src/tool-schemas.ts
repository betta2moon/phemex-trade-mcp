export interface ToolParam {
  type: "string" | "number" | "boolean";
  required: boolean;
  help: string;
  default?: string;
  example?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  params: Record<string, ToolParam>;
  examples: string[];
}

const contractTypeParam: ToolParam = {
  type: "string",
  required: false,
  help: "linear (USDT-M, default), inverse (Coin-M), or spot",
  default: "linear",
  example: "linear",
};

export const TOOL_SCHEMAS: Record<string, ToolSchema> = {
  get_ticker: {
    name: "get_ticker",
    description: "Get 24hr price ticker for a symbol",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair (e.g. BTCUSDT, BTCUSD)", example: "BTCUSDT" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_ticker --symbol BTCUSDT",
      "phemex-cli get_ticker --symbol BTCUSD --contractType inverse",
      "phemex-cli get_ticker --symbol BTCUSDT --contractType spot",
    ],
  },

  get_orderbook: {
    name: "get_orderbook",
    description: "Get order book snapshot (30 levels)",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair (e.g. BTCUSDT)", example: "BTCUSDT" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_orderbook --symbol BTCUSDT",
      "phemex-cli get_orderbook --symbol BTCUSD --contractType inverse",
    ],
  },

  get_klines: {
    name: "get_klines",
    description: "Get historical candlestick/kline data",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      resolution: { type: "number", required: true, help: "Candle interval in seconds (60, 300, 900, 1800, 3600, 14400, 86400)", example: "3600" },
      limit: { type: "number", required: false, help: "Number of candles to return", default: "100", example: "50" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_klines --symbol BTCUSDT --resolution 3600 --limit 100",
      "phemex-cli get_klines --symbol ETHUSDT --resolution 86400",
    ],
  },

  get_recent_trades: {
    name: "get_recent_trades",
    description: "Get recent market trades",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_recent_trades --symbol BTCUSDT",
    ],
  },

  get_funding_rate: {
    name: "get_funding_rate",
    description: "Get funding rate history (futures only)",
    params: {
      symbol: { type: "string", required: true, help: "Funding rate symbol (e.g. .BTCFR8H)", example: ".BTCFR8H" },
      limit: { type: "number", required: false, help: "Number of records", default: "20", example: "10" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_funding_rate --symbol .BTCFR8H --limit 20",
    ],
  },

  get_account: {
    name: "get_account",
    description: "Get futures account balance and margin info",
    params: {
      currency: { type: "string", required: false, help: "Settlement currency", default: "USDT", example: "USDT" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_account --currency USDT",
      "phemex-cli get_account --currency BTC --contractType inverse",
    ],
  },

  get_spot_wallet: {
    name: "get_spot_wallet",
    description: "Get spot wallet balances per currency",
    params: {},
    examples: [
      "phemex-cli get_spot_wallet",
    ],
  },

  get_positions: {
    name: "get_positions",
    description: "Get current positions with unrealized PnL (futures only)",
    params: {
      currency: { type: "string", required: false, help: "Settlement currency", default: "USDT", example: "USDT" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_positions --currency USDT",
      "phemex-cli get_positions --currency BTC --contractType inverse",
    ],
  },

  get_open_orders: {
    name: "get_open_orders",
    description: "Get all open orders for a symbol",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_open_orders --symbol BTCUSDT",
    ],
  },

  get_order_history: {
    name: "get_order_history",
    description: "Get closed/filled order history",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      limit: { type: "number", required: false, help: "Number of records", default: "50", example: "20" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_order_history --symbol BTCUSDT --limit 20",
    ],
  },

  get_trades: {
    name: "get_trades",
    description: "Get trade execution history",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      limit: { type: "number", required: false, help: "Number of records", default: "50", example: "20" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli get_trades --symbol BTCUSDT --limit 20",
    ],
  },

  place_order: {
    name: "place_order",
    description: "Place an order (Market, Limit, Stop, StopLimit)",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair (e.g. BTCUSDT)", example: "BTCUSDT" },
      side: { type: "string", required: true, help: "Buy or Sell", example: "Buy" },
      orderQty: { type: "number", required: true, help: "Quantity. linear: base amount (0.01 = 0.01 BTC). inverse: contracts (integer). spot: depends on qtyType.", example: "0.01" },
      ordType: { type: "string", required: true, help: "Order type: Market, Limit, Stop, StopLimit", example: "Market" },
      price: { type: "number", required: false, help: "Limit price (required for Limit/StopLimit)", example: "85000" },
      stopPx: { type: "number", required: false, help: "Stop trigger price (required for Stop/StopLimit)", example: "84000" },
      timeInForce: { type: "string", required: false, help: "GoodTillCancel, PostOnly, ImmediateOrCancel, FillOrKill", default: "GoodTillCancel", example: "PostOnly" },
      reduceOnly: { type: "boolean", required: false, help: "Only reduce position (cannot increase)", default: "false", example: "true" },
      posSide: { type: "string", required: false, help: "Position side: Merged (OneWay), Long, Short (Hedged)", default: "Merged", example: "Merged" },
      takeProfit: { type: "number", required: false, help: "Take profit price", example: "90000" },
      stopLoss: { type: "number", required: false, help: "Stop loss price", example: "80000" },
      triggerType: { type: "string", required: false, help: "Trigger type for stop orders: ByMarkPrice, ByLastPrice", example: "ByLastPrice" },
      qtyType: { type: "string", required: false, help: "Spot only: ByBase (qty in base currency) or ByQuote (qty in quote currency)", default: "ByBase", example: "ByQuote" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli place_order --symbol BTCUSDT --side Buy --orderQty 0.01 --ordType Market",
      "phemex-cli place_order --symbol BTCUSDT --side Sell --orderQty 0.01 --ordType Limit --price 90000 --timeInForce PostOnly",
      "phemex-cli place_order --symbol BTCUSD --side Buy --orderQty 100 --ordType Market --contractType inverse",
    ],
  },

  amend_order: {
    name: "amend_order",
    description: "Modify price or quantity of an open order",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      orderID: { type: "string", required: false, help: "Order ID (provide orderID or origClOrdID)", example: "abc-123" },
      origClOrdID: { type: "string", required: false, help: "Original client order ID", example: "betta2moon..." },
      price: { type: "number", required: false, help: "New limit price", example: "95000" },
      orderQty: { type: "number", required: false, help: "New quantity", example: "0.02" },
      posSide: { type: "string", required: false, help: "Position side (Merged/Long/Short)", default: "Merged" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli amend_order --symbol BTCUSDT --orderID abc-123 --price 95000",
    ],
  },

  cancel_order: {
    name: "cancel_order",
    description: "Cancel a single order by orderID or clOrdID",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      orderID: { type: "string", required: false, help: "Order ID (provide orderID or clOrdID)", example: "abc-123" },
      clOrdID: { type: "string", required: false, help: "Client order ID", example: "betta2moon..." },
      posSide: { type: "string", required: false, help: "Position side (Merged/Long/Short)", default: "Merged" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli cancel_order --symbol BTCUSDT --orderID abc-123",
    ],
  },

  cancel_all_orders: {
    name: "cancel_all_orders",
    description: "Cancel all open orders for a symbol",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      untriggered: { type: "boolean", required: false, help: "Also cancel untriggered conditional orders", default: "false" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli cancel_all_orders --symbol BTCUSDT",
      "phemex-cli cancel_all_orders --symbol BTCUSDT --untriggered",
    ],
  },

  set_leverage: {
    name: "set_leverage",
    description: "Set leverage for a perpetual symbol (futures only)",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      leverage: { type: "number", required: true, help: "Leverage multiplier (e.g. 1, 5, 10, 20, 50, 100)", example: "10" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli set_leverage --symbol BTCUSDT --leverage 10",
      "phemex-cli set_leverage --symbol BTCUSD --leverage 5 --contractType inverse",
    ],
  },

  switch_pos_mode: {
    name: "switch_pos_mode",
    description: "Switch between OneWay and Hedged position mode (USDT-M only)",
    params: {
      symbol: { type: "string", required: true, help: "Trading pair", example: "BTCUSDT" },
      targetPosMode: { type: "string", required: true, help: "Target mode: OneWay or Hedged", example: "OneWay" },
      contractType: contractTypeParam,
    },
    examples: [
      "phemex-cli switch_pos_mode --symbol BTCUSDT --targetPosMode OneWay",
    ],
  },

  transfer_funds: {
    name: "transfer_funds",
    description: "Transfer funds between spot and futures wallets",
    params: {
      currency: { type: "string", required: true, help: "Currency to transfer (e.g. USDT, BTC)", example: "USDT" },
      amount: { type: "number", required: true, help: "Amount to transfer", example: "100" },
      direction: { type: "string", required: true, help: "spot_to_futures or futures_to_spot", example: "spot_to_futures" },
    },
    examples: [
      "phemex-cli transfer_funds --currency USDT --amount 100 --direction spot_to_futures",
    ],
  },

  get_transfer_history: {
    name: "get_transfer_history",
    description: "Query transfer history",
    params: {
      currency: { type: "string", required: true, help: "Currency", example: "USDT" },
      direction: { type: "string", required: false, help: "Filter: spot_to_futures or futures_to_spot", example: "spot_to_futures" },
      limit: { type: "number", required: false, help: "Number of records", default: "20", example: "10" },
    },
    examples: [
      "phemex-cli get_transfer_history --currency USDT --limit 10",
    ],
  },

  list_symbols: {
    name: "list_symbols",
    description: "List all available trading symbols on Phemex",
    params: {
      contractType: { type: "string", required: false, help: "Filter by type: linear, inverse, or spot. Omit to list all.", example: "linear" },
    },
    examples: [
      "phemex-cli list_symbols",
      "phemex-cli list_symbols --contractType linear",
      "phemex-cli list_symbols --contractType spot",
    ],
  },
};

export function formatHelp(schema: ToolSchema): string {
  const lines: string[] = [];
  lines.push(`Usage: phemex-cli ${schema.name} [options]`);
  lines.push("");
  lines.push(schema.description);
  lines.push("");

  const required = Object.entries(schema.params).filter(([, p]) => p.required);
  const optional = Object.entries(schema.params).filter(([, p]) => !p.required);

  if (required.length > 0) {
    lines.push("Required Parameters:");
    for (const [name, param] of required) {
      const label = `  --${name} <${param.type}>`;
      lines.push(`${label.padEnd(28)} ${param.help}`);
    }
    lines.push("");
  }

  if (optional.length > 0) {
    lines.push("Optional Parameters:");
    for (const [name, param] of optional) {
      const label = `  --${name} <${param.type}>`;
      const defaultStr = param.default ? ` [default: ${param.default}]` : "";
      lines.push(`${label.padEnd(28)} ${param.help}${defaultStr}`);
    }
    lines.push("");
  }

  if (schema.examples.length > 0) {
    lines.push("Examples:");
    for (const ex of schema.examples) {
      lines.push(`  ${ex}`);
    }
  }

  return lines.join("\n");
}
