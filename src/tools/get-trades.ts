import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerGetTrades(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "get_trades",
    "Query trade execution history for a symbol (USDT-M, Coin-M, or Spot)",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M/Spot) or BTCUSD (Coin-M)"),
      limit: z.number().optional().default(50).describe("Max results (up to 200)"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, limit, contractType }) => {
      const symbolErr = ContractRouter.validateSymbol(contractType, symbol);
      if (symbolErr) {
        return { content: [{ type: "text" as const, text: `Error: ${symbolErr}` }], isError: true };
      }
      const resolved = ContractRouter.resolveSymbol(contractType, symbol);

      const endpoint = ContractRouter.getEndpoint(contractType, "tradeHistory");
      const res = await client.get<unknown>(endpoint, { symbol: resolved, limit });
      if (res.code !== 0) {
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
