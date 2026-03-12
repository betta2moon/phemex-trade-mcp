/**
 * Maps Phemex API field names (with Rp/Rv/Rr/Rq suffixes) to friendly names.
 * Used for USDT-M (linear) responses that use "Real" decimal string fields.
 *
 * Note: Coin-M (inverse) and Spot responses use integer-scaled Ep/Ev/Er fields,
 * which are already converted by ProductInfoCache.convertResponse().
 * This mapper handles the Rp/Rv/Rr/Rq suffixed fields from linear endpoints.
 */

const FIELD_MAP: Record<string, string> = {
  // Prices (Rp = Real Price)
  closeRp: "closePrice",
  openRp: "openPrice",
  highRp: "highPrice",
  lowRp: "lowPrice",
  markPriceRp: "markPrice",
  indexPriceRp: "indexPrice",
  avgEntryPriceRp: "avgEntryPrice",
  liquidationPriceRp: "liquidationPrice",
  bankruptPriceRp: "bankruptPrice",
  priceRp: "price",
  stopPxRp: "stopPrice",
  takeProfitRp: "takeProfit",
  stopLossRp: "stopLoss",

  // Values (Rv = Real Value)
  valueRv: "value",
  accountBalanceRv: "accountBalance",
  totalUsedBalanceRv: "totalUsedBalance",
  bonusBalanceRv: "bonusBalance",
  unRealisedPnlRv: "unrealizedPnl",
  cumClosedPnlRv: "cumClosedPnl",
  cumRealisedPnlRv: "cumRealizedPnl",
  curTermRealisedPnlRv: "curTermRealizedPnl",
  realisedPnlRv: "realizedPnl",
  positionMarginRv: "positionMargin",
  assignedPosBalanceRv: "assignedPosBalance",
  posCostRv: "posCost",
  estimatedOrdLossRv: "estimatedOrdLoss",
  usedBalanceRv: "usedBalance",
  turnoverRv: "turnover",
  riskLimitRv: "riskLimit",
  cumFundingFeeRv: "cumFundingFee",
  cumTransactFeeRv: "cumTransactFee",
  bankruptCommRv: "bankruptComm",
  buyLeavesValueRv: "buyLeavesValue",
  sellLeavesValueRv: "sellLeavesValue",

  // Rates (Rr = Real Rate)
  fundingRateRr: "fundingRate",
  predFundingRateRr: "predFundingRate",
  leverageRr: "leverage",
  initMarginReqRr: "initMarginReq",
  maintMarginReqRr: "maintMarginReq",
  deleveragePercentileRr: "deleveragePercentile",
  buyValueToCostRr: "buyValueToCost",
  sellValueToCostRr: "sellValueToCost",

  // Quantities (Rq = Real Quantity)
  sizeRq: "size",
  orderQtyRq: "orderQty",
  volumeRq: "volume",
};

export function mapFields(obj: unknown, useRaw = false): unknown {
  if (useRaw) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => mapFields(item, useRaw));
  }

  if (obj !== null && typeof obj === "object") {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const newKey = FIELD_MAP[key] || key;
      mapped[newKey] = mapFields(value, useRaw);
    }
    return mapped;
  }

  return obj;
}

export { FIELD_MAP };
