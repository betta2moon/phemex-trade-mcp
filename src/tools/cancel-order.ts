import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerCancelOrder(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "cancel_order",
    "Cancel a single open order by orderID or clOrdID (USDT-M, Coin-M, or Spot)",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M/Spot) or BTCUSD (Coin-M)"),
      orderID: z.string().optional().describe("Phemex order ID"),
      clOrdID: z.string().optional().describe("Client order ID"),
      posSide: z.enum(["Long", "Short", "Merged"]).optional().default("Merged")
        .describe("Position side. Hedged mode: 'Long' or 'Short'. OneWay mode: 'Merged' (default)."),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, orderID, clOrdID, posSide, contractType }) => {
      if (!orderID && !clOrdID) {
        return {
          content: [{ type: "text" as const, text: "Error: provide either orderID or clOrdID" }],
          isError: true,
        };
      }

      const symbolErr = ContractRouter.validateSymbol(contractType, symbol);
      if (symbolErr) {
        return { content: [{ type: "text" as const, text: `Error: ${symbolErr}` }], isError: true };
      }
      const resolved = ContractRouter.resolveSymbol(contractType, symbol);

      const endpoint = ContractRouter.getEndpoint(contractType, "cancelOrder");
      const params: Record<string, string | number | boolean> = { symbol: resolved };
      if (orderID) params.orderID = orderID;
      if (clOrdID) params.clOrdID = clOrdID;
      if (!ContractRouter.isInverse(contractType) && !ContractRouter.isSpot(contractType)) params.posSide = posSide ?? "Merged";

      const res = await client.delete<unknown>(endpoint, params);
      if (res.code !== 0) {
        return { content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code)}` }], isError: true };
      }
      const responseData = (ContractRouter.isInverse(contractType) || ContractRouter.isSpot(contractType))
        ? productCache.convertResponse(resolved, res.data)
        : res.data;
      return { content: [{ type: "text" as const, text: `Order cancelled.\n${JSON.stringify(responseData, null, 2)}` }] };
    }
  );
}
