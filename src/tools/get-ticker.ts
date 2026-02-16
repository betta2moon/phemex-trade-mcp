import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerGetTicker(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "get_ticker",
    "Get 24hr price ticker for a symbol (USDT-M, Coin-M, or Spot)",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M/Spot) or BTCUSD (Coin-M)"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, contractType }) => {
      const resolved = ContractRouter.resolveSymbol(contractType, symbol);
      const endpoint = ContractRouter.getEndpoint(contractType, "ticker");
      const res = await client.getPublicMd<unknown>(endpoint, { symbol: resolved });
      if (res.error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${res.error.message} (code: ${res.error.code})` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(res.result, null, 2) }],
      };
    }
  );
}
