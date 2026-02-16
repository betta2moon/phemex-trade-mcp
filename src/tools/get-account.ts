import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerGetAccount(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "get_account",
    "Query account balance and margin info (USDT-M or Coin-M)",
    {
      currency: z.string().optional().default("USDT").describe("Currency: USDT for linear; BTC, ETH, SOL, etc. for inverse (Coin-M)"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ currency, contractType }) => {
      if (ContractRouter.isSpot(contractType)) {
        return { content: [{ type: "text" as const, text: "Error: Spot does not have a futures-style account. Use the get_spot_wallet tool for spot balances." }], isError: true };
      }
      const endpoint = ContractRouter.getEndpoint(contractType, "account");
      const res = await client.get<unknown>(endpoint, { currency });
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
