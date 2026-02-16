import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerGetKlines(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "get_klines",
    "Get historical kline/candlestick data for a symbol (USDT-M, Coin-M, or Spot)",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M/Spot) or BTCUSD (Coin-M)"),
      resolution: z.number().describe("Kline interval in seconds: 60, 300, 900, 1800, 3600, 14400, 86400"),
      limit: z.number().optional().default(100).describe("Number of klines: 5, 10, 50, 100, 500, 1000"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, resolution, limit, contractType }) => {
      const resolved = ContractRouter.resolveSymbol(contractType, symbol);
      const to = Math.floor(Date.now() / 1000);
      const from = to - resolution * limit;
      const endpoint = ContractRouter.getEndpoint(contractType, "klines");
      const res = await client.getPublic<unknown>(endpoint, {
        symbol: resolved,
        resolution,
        limit,
        from,
        to,
      });
      if (res.code !== 0) {
        return {
          content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code)}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(res.data, null, 2) }],
      };
    }
  );
}
