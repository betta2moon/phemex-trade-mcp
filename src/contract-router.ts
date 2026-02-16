import { ContractType } from "./types.js";

type Operation =
  | "placeOrder" | "cancelOrder" | "amendOrder" | "cancelAll"
  | "setLeverage" | "switchPosMode"
  | "account" | "positions" | "openOrders" | "orderHistory" | "tradeHistory"
  | "ticker" | "orderbook" | "klines" | "recentTrades" | "fundingRate";

const ENDPOINTS: Record<ContractType, Record<Operation, string>> = {
  linear: {
    placeOrder: "/g-orders/create",
    cancelOrder: "/g-orders/cancel",
    amendOrder: "/g-orders/replace",
    cancelAll: "/g-orders/all",
    setLeverage: "/g-positions/leverage",
    switchPosMode: "/g-positions/switch-pos-mode-sync",
    account: "/g-accounts/accountPositions",
    positions: "/g-accounts/positions",
    openOrders: "/g-orders/activeList",
    orderHistory: "/api-data/g-futures/orders",
    tradeHistory: "/api-data/g-futures/trades",
    ticker: "/md/v2/ticker/24hr",
    orderbook: "/md/v2/orderbook",
    klines: "/exchange/public/md/v2/kline/list",
    recentTrades: "/md/v2/trade",
    fundingRate: "/api-data/public/data/funding-rate-history",
  },
  inverse: {
    placeOrder: "/orders/create",
    cancelOrder: "/orders/cancel",
    amendOrder: "/orders/replace",
    cancelAll: "/orders/all",
    setLeverage: "/positions/leverage",
    switchPosMode: "/positions/switch-pos-mode-sync",
    account: "/accounts/accountPositions",
    positions: "/accounts/positions",
    openOrders: "/orders/activeList",
    orderHistory: "/exchange/order/list",
    tradeHistory: "/exchange/order/trade",
    ticker: "/md/v1/ticker/24hr",
    orderbook: "/md/orderbook",
    klines: "/exchange/public/md/v2/kline",
    recentTrades: "/md/trade",
    fundingRate: "/api-data/public/data/funding-rate-history",
  },
  spot: {
    placeOrder: "/spot/orders/create",
    cancelOrder: "/spot/orders",
    amendOrder: "/spot/orders",
    cancelAll: "/spot/orders/all",
    setLeverage: "",
    switchPosMode: "",
    account: "",
    positions: "",
    openOrders: "/spot/orders",
    orderHistory: "/api-data/spots/orders",
    tradeHistory: "/api-data/spots/trades",
    ticker: "/md/spot/ticker/24hr",
    orderbook: "/md/orderbook",
    klines: "/exchange/public/md/v2/kline/list",
    recentTrades: "/md/trade",
    fundingRate: "",
  },
};

export class ContractRouter {
  static getEndpoint(contractType: ContractType, operation: Operation): string {
    return ENDPOINTS[contractType][operation];
  }

  static resolveSymbol(contractType: ContractType, symbol: string): string {
    if (contractType === "spot" && !symbol.startsWith("s")) {
      return "s" + symbol;
    }
    return symbol;
  }

  static validateSymbol(contractType: ContractType, symbol: string): string | null {
    if (contractType === "spot") {
      const raw = symbol.startsWith("s") ? symbol.slice(1) : symbol;
      if (raw.endsWith("USD") && !raw.endsWith("USDT")) {
        return `Symbol ${symbol} looks like a Coin-M symbol. Spot symbols should end in USDT (e.g. BTCUSDT).`;
      }
      return null;
    }
    if (contractType === "inverse" && symbol.endsWith("USDT")) {
      return `Symbol ${symbol} looks like a USDT-M symbol. Use contractType="linear" for USDT-M symbols.`;
    }
    if (contractType === "linear" && symbol.endsWith("USD") && !symbol.endsWith("USDT")) {
      return `Symbol ${symbol} looks like a Coin-M symbol. Use contractType="inverse" for Coin-M symbols.`;
    }
    return null;
  }

  static isInverse(contractType: ContractType): boolean {
    return contractType === "inverse";
  }

  static isSpot(contractType: ContractType): boolean {
    return contractType === "spot";
  }
}
