export interface EnhancedError {
  error: string;
  code: number | string;
  suggestion?: string;
  tip?: string;
  docs?: string;
}

type ErrorEnhancer = (err: any, params: any) => EnhancedError;

const ERROR_ENHANCEMENTS: Record<number | string, ErrorEnhancer> = {
  // ── Numeric error codes ────────────────────────────────────────────────────

  6001: (err, params) => {
    if (params.symbol) {
      // Symbol ending in USD but not USDT → likely meant USDT perpetual
      if (params.symbol.endsWith("USD") && !params.symbol.endsWith("USDT")) {
        return {
          error: `Invalid symbol: ${params.symbol}`,
          code: 6001,
          suggestion: `Did you mean ${params.symbol}T? For USDT perpetuals, use symbols ending in USDT (e.g. BTCUSDT).`,
          tip: 'Run "phemex-cli list_symbols" to see all available symbols.',
        };
      }
      // Generic invalid symbol
      return {
        error: `Invalid symbol: ${params.symbol}`,
        code: 6001,
        suggestion: `Symbol "${params.symbol}" is not recognized. Check spelling and contract type.`,
        tip: 'Run "phemex-cli list_symbols" to see all available symbols.',
      };
    }
    return {
      error: err.message || "Invalid argument",
      code: 6001,
      suggestion: params._tool
        ? `Run "phemex-cli ${params._tool} --help" to see valid parameters.`
        : "Check your parameters.",
    };
  },

  10001: (err, params) => ({
    error: "Illegal request",
    code: 10001,
    suggestion: "The request format may be invalid. Check parameter types and values.",
    tip: params._tool
      ? `Run "phemex-cli ${params._tool} --help" to see parameter requirements.`
      : 'Run "phemex-cli <tool> --help" to see parameter requirements.',
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

  // ── String-based error messages (Phemex returns these in the msg field) ──

  TE_QTY_TOO_LARGE: (err, params) => ({
    error: "Order quantity too large",
    code: "TE_QTY_TOO_LARGE",
    suggestion: `The order quantity exceeds the maximum allowed for ${params.symbol || "this symbol"}.`,
    tip: 'Reduce --orderQty or check the symbol\'s max order size on Phemex.',
  }),

  TE_QTY_TOO_SMALL: (err, params) => ({
    error: "Order quantity too small",
    code: "TE_QTY_TOO_SMALL",
    suggestion: `The order quantity is below the minimum for ${params.symbol || "this symbol"}.`,
    tip: "Check the minimum order quantity for this symbol on Phemex.",
  }),

  TE_PRICE_TOO_HIGH: (err, params) => ({
    error: "Order price too high",
    code: "TE_PRICE_TOO_HIGH",
    suggestion: `The limit price is above the maximum allowed for ${params.symbol || "this symbol"}.`,
    tip: "Use a price closer to the current market price.",
  }),

  TE_PRICE_TOO_LOW: (err, params) => ({
    error: "Order price too low",
    code: "TE_PRICE_TOO_LOW",
    suggestion: `The limit price is below the minimum allowed for ${params.symbol || "this symbol"}.`,
    tip: "Use a price closer to the current market price.",
  }),

  TE_NO_ENOUGH_AVAILABLE_BALANCE: (err, params) => ({
    error: "Insufficient available balance",
    code: "TE_NO_ENOUGH_AVAILABLE_BALANCE",
    suggestion: `Not enough ${params.currency || "USDT"} to place this order.`,
    tip: 'Check your balance with "phemex-cli get_account --currency USDT"',
  }),

  TE_SYMBOL_INVALID: (err, params) => ({
    error: `Invalid symbol: ${params.symbol || "unknown"}`,
    code: "TE_SYMBOL_INVALID",
    suggestion: `Symbol "${params.symbol || "unknown"}" is not recognized.`,
    tip: 'Run "phemex-cli list_symbols" to see all available symbols.',
  }),

  OM_ORDER_NOT_FOUND: (err, params) => ({
    error: `Order not found${params.orderID ? `: ${params.orderID}` : ""}`,
    code: "OM_ORDER_NOT_FOUND",
    suggestion: "The order may have already been filled or cancelled.",
    tip: `Check order history with "phemex-cli get_order_history --symbol ${params.symbol || "BTCUSDT"}"`,
  }),

  TE_CANNOT_AMEND: () => ({
    error: "Cannot amend order",
    code: "TE_CANNOT_AMEND",
    suggestion: "The order cannot be amended. It may already be filled, cancelled, or in a terminal state.",
  }),

  TE_REDUCE_ONLY_REJECT: () => ({
    error: "Reduce-only order rejected",
    code: "TE_REDUCE_ONLY_REJECT",
    suggestion: "The reduce-only order was rejected because it would increase your position.",
    tip: "Check your current position size before placing reduce-only orders.",
  }),
};

/**
 * Enhance a Phemex API error with user-friendly messages.
 *
 * Accepts either:
 * - An object with { code, message } (from API response)
 * - An object with { code, msg } (as returned by PhemexResponse)
 *
 * The params object provides context (symbol, _tool, etc.) for richer messages.
 */
export function enhanceError(err: any, params: any = {}): EnhancedError {
  const code = err.code ?? err.error_code ?? err.statusCode ?? "UNKNOWN";
  const msg = err.msg ?? err.message ?? "";

  // Try string msg first — TE_/OM_ codes are more specific than generic numeric codes
  if (typeof msg === "string" && ERROR_ENHANCEMENTS[msg]) {
    return ERROR_ENHANCEMENTS[msg](err, params);
  }

  // Then try numeric code
  const enhancerByCode = ERROR_ENHANCEMENTS[code];
  if (enhancerByCode) {
    return enhancerByCode(err, params);
  }

  // Network / fetch errors
  if (msg?.includes?.("fetch failed") || msg?.includes?.("ECONNREFUSED")) {
    return {
      error: "Network error: unable to reach Phemex API",
      code: "NETWORK_ERROR",
      suggestion: "Check your internet connection and PHEMEX_API_URL setting.",
      tip: "Testnet: https://testnet-api.phemex.com  Mainnet: https://api.phemex.com",
    };
  }

  return {
    error: msg || JSON.stringify(err),
    code,
  };
}
