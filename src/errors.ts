export interface EnhancedError {
  error: string;
  code: number | string;
  suggestion?: string;
  tip?: string;
  docs?: string;
}

type ErrorEnhancer = (err: any, params: any) => EnhancedError;

const ERROR_ENHANCEMENTS: Record<number | string, ErrorEnhancer> = {
  6001: (err, params) => {
    if (params.symbol) {
      if (params.symbol.endsWith("USD") && !params.symbol.endsWith("USDT")) {
        return {
          error: `Invalid symbol: ${params.symbol}`,
          code: 6001,
          suggestion: `Did you mean ${params.symbol}T? For USDT perpetuals, use symbols ending in USDT (e.g. BTCUSDT).`,
          tip: 'Run "phemex-cli list_symbols" to see all available symbols.',
        };
      }
    }
    return { error: err.message || "Invalid argument", code: 6001 };
  },

  10001: (err) => ({
    error: "Illegal request",
    code: 10001,
    suggestion: "The request format may be invalid. Check parameter types and values.",
    tip: 'Run "phemex-cli <tool> --help" to see parameter requirements.',
  }),

  10002: () => ({
    error: "Too many requests (rate limited)",
    code: 10002,
    suggestion: "You are being rate limited. Wait a few seconds before retrying.",
    tip: "Reduce request frequency or batch operations.",
  }),

  10003: () => ({
    error: "Invalid API key or signature",
    code: 10003,
    suggestion: "Check your PHEMEX_API_KEY and PHEMEX_API_SECRET in environment variables or ~/.phemexrc",
    tip: "Ensure you are using the correct API URL (testnet vs mainnet).",
    docs: "https://github.com/betta2moon/phemex-trade-mcp#setup",
  }),

  10005: () => ({
    error: "Request timeout",
    code: 10005,
    suggestion: "The request timed out. Check your network connection and try again.",
  }),

  10500: (err, params) => ({
    error: err.message || "Missing required parameter",
    code: 10500,
    suggestion: params._tool
      ? `Run "phemex-cli ${params._tool} --help" to see all required parameters.`
      : "Check the required parameters for this command.",
  }),

  11001: (err, params) => ({
    error: "Insufficient available balance",
    code: 11001,
    suggestion: `Not enough ${params.currency || "USDT"} to place this order.`,
    tip: 'Check your balance with "phemex-cli get_account --currency USDT"',
  }),

  11038: () => ({
    error: "Invalid trigger price",
    code: 11038,
    suggestion: "The stop/trigger price is invalid. For buy stops, trigger must be above market. For sell stops, below market.",
  }),

  11074: () => ({
    error: "Invalid leverage",
    code: 11074,
    suggestion: "The leverage value is out of range for this symbol.",
    tip: "Common ranges: 1-100x for BTC, 1-50x for altcoins.",
  }),

  20004: () => ({
    error: "Inconsistent position mode",
    code: 20004,
    suggestion: "Your posSide parameter doesn't match your account's position mode.",
    tip: 'Use --posSide Merged for OneWay mode, or Long/Short for Hedged mode. Check with "phemex-cli get_positions".',
  }),

  39108: (err, params) => ({
    error: "Invalid parameter",
    code: 39108,
    suggestion: params._tool
      ? `Run "phemex-cli ${params._tool} --help" to see valid parameter values.`
      : "Check parameter values and types.",
  }),

  39995: () => ({
    error: "Too many requests (rate limited)",
    code: 39995,
    suggestion: "You are being rate limited. Wait a few seconds before retrying.",
  }),

  39996: (err, params) => ({
    error: `Order not found${params.orderID ? `: ${params.orderID}` : ""}`,
    code: 39996,
    suggestion: "The order may have already been filled or cancelled.",
    tip: `Check order history with "phemex-cli get_order_history --symbol ${params.symbol || "BTCUSDT"}"`,
  }),
};

export function enhanceError(err: any, params: any = {}): EnhancedError {
  const code = err.code ?? err.error_code ?? err.statusCode ?? "UNKNOWN";
  const enhancer = ERROR_ENHANCEMENTS[code];

  if (enhancer) {
    return enhancer(err, params);
  }

  // Network / fetch errors
  if (err.message?.includes("fetch failed") || err.message?.includes("ECONNREFUSED")) {
    return {
      error: "Network error: unable to reach Phemex API",
      code: "NETWORK_ERROR",
      suggestion: "Check your internet connection and PHEMEX_API_URL setting.",
      tip: "Testnet: https://testnet-api.phemex.com  Mainnet: https://api.phemex.com",
    };
  }

  return {
    error: err.message || JSON.stringify(err),
    code,
  };
}
