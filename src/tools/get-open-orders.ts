import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerGetOpenOrders(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "get_open_orders",
    "List all open orders for a symbol (USDT-M, Coin-M, or Spot)",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M/Spot) or BTCUSD (Coin-M)"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, contractType }) => {
      const symbolErr = ContractRouter.validateSymbol(contractType, symbol);
      if (symbolErr) {
        return { content: [{ type: "text" as const, text: `Error: ${symbolErr}` }], isError: true };
      }
      const resolved = ContractRouter.resolveSymbol(contractType, symbol);

      const endpoint = ContractRouter.getEndpoint(contractType, "openOrders");
      const res = await client.get<unknown>(endpoint, { symbol: resolved });
      if (res.code !== 0) {
        // Coin-M API returns "OM_ORDER_NOT_FOUND" when there are no open orders
        if (res.msg === "OM_ORDER_NOT_FOUND") {
          return { content: [{ type: "text" as const, text: `No open orders for ${symbol}.` }] };
        }
        return {
          content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code, res.msg)}` }],
          isError: true,
        };
      }
      const responseData = (ContractRouter.isInverse(contractType) || ContractRouter.isSpot(contractType))
        ? productCache.convertResponse(resolved, res.data)
        : res.data;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(responseData, null, 2) }],
      };
    }
  );
}
