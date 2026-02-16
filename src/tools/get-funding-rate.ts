import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerGetFundingRate(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "get_funding_rate",
    "Get funding rate history for a perpetual symbol (USDT-M or Coin-M)",
    {
      symbol: z.string().describe("Funding rate symbol, e.g. .BTCFR8H"),
      limit: z.number().optional().default(20).describe("Number of records (max 100)"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, limit, contractType }) => {
      if (ContractRouter.isSpot(contractType)) {
        return { content: [{ type: "text" as const, text: "Error: Spot does not have funding rates." }], isError: true };
      }
      const endpoint = ContractRouter.getEndpoint(contractType, "fundingRate");
      const res = await client.getPublic<unknown>(endpoint, {
        symbol,
        limit,
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
