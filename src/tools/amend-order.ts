import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerAmendOrder(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "amend_order",
    "Amend an open order — modify price or quantity (USDT-M, Coin-M, or Spot)",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M/Spot) or BTCUSD (Coin-M)"),
      orderID: z.string().optional().describe("Phemex order ID to amend"),
      origClOrdID: z.string().optional().describe("Original client order ID to amend"),
      price: z.string().optional().describe("New price as decimal string"),
      orderQty: z.string().optional().describe("New quantity as decimal string (USDT-M) or integer contracts (Coin-M)"),
      posSide: z.enum(["Long", "Short", "Merged"]).optional().default("Merged")
        .describe("Position side. Hedged mode: 'Long' or 'Short'. OneWay mode: 'Merged' (default)."),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, orderID, origClOrdID, price, orderQty, posSide, contractType }) => {
      if (!orderID && !origClOrdID) {
        return {
          content: [{ type: "text" as const, text: "Error: provide either orderID or origClOrdID" }],
          isError: true,
        };
      }

      const symbolErr = ContractRouter.validateSymbol(contractType, symbol);
      if (symbolErr) {
        return { content: [{ type: "text" as const, text: `Error: ${symbolErr}` }], isError: true };
      }
      const resolved = ContractRouter.resolveSymbol(contractType, symbol);

      const endpoint = ContractRouter.getEndpoint(contractType, "amendOrder");
      const params: Record<string, string | number | boolean> = { symbol: resolved };
      if (orderID) params.orderID = orderID;
      if (origClOrdID) params.origClOrdID = origClOrdID;
      if (!ContractRouter.isInverse(contractType) && !ContractRouter.isSpot(contractType)) params.posSide = posSide ?? "Merged";

      if (ContractRouter.isInverse(contractType) || ContractRouter.isSpot(contractType)) {
        if (!productCache.isLoaded()) {
          return { content: [{ type: "text" as const, text: "Error: Product info not loaded. Required for price/qty scaling." }], isError: true };
        }
        if (price !== undefined) params.priceEp = productCache.scalePrice(resolved, price);
        if (orderQty !== undefined) {
          if (ContractRouter.isSpot(contractType)) {
            params.baseQtyEv = productCache.scaleValue(resolved, orderQty);
          } else {
            params.orderQty = parseInt(orderQty);
          }
        }
      } else {
        if (price !== undefined) params.priceRp = price;
        if (orderQty !== undefined) params.orderQtyRq = orderQty;
      }

      const res = await client.putWithQuery<unknown>(endpoint, params);
      if (res.code !== 0) {
        return { content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code)}` }], isError: true };
      }
      const responseData = (ContractRouter.isInverse(contractType) || ContractRouter.isSpot(contractType))
        ? productCache.convertResponse(resolved, res.data)
        : res.data;
      return { content: [{ type: "text" as const, text: `Order amended.\n${JSON.stringify(responseData, null, 2)}` }] };
    }
  );
}
