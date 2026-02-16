// Trading/Account endpoints: { code: 0, msg: "OK", data: {...} }
export interface PhemexResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

// Market data endpoints (/md/): { error: null, id: 0, result: {...} }
export interface PhemexMdResponse<T = unknown> {
  error: { code: number; message: string } | null;
  id: number;
  result: T;
}

export const PHEMEX_ERRORS: Record<number, string> = {
  0: "OK",
  10001: "Illegal request",
  10002: "Too many requests",
  10003: "Key is not valid",
  10005: "Request timeout",
  10500: "Missing required parameter",
  11001: "Insufficient available balance",
  11038: "Invalid trigger price",
  11074: "Invalid leverage",
  20004: "Inconsistent position mode (check posSide param matches account pos mode)",
  39108: "Invalid parameter",
  39995: "Too many requests (rate limited)",
  39996: "Order not found",
};

export interface PhemexConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  maxOrderValue?: number;
}

export type ContractType = "linear" | "inverse" | "spot";

export interface ProductInfo {
  symbol: string;
  contractType: ContractType;
  priceScale: number;
  ratioScale: number;
  valueScale: number;
  contractSize: number;
}
