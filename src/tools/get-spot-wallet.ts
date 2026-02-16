import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";

export function registerGetSpotWallet(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "get_spot_wallet",
    "Query spot wallet balances. Returns available and locked balances per currency.",
    {},
    async () => {
      const res = await client.get<unknown>("/spot/wallets");
      if (res.code !== 0) {
        return {
          content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code)}` }],
          isError: true,
        };
      }

      // Convert Ev fields to decimal using currency scales
      let data = res.data;
      if (Array.isArray(data) && productCache.isLoaded()) {
        data = data.map((wallet: Record<string, unknown>) => {
          const display = { ...wallet };
          const currency = wallet.currency as string | undefined;
          if (!currency) return display;
          try {
            if (typeof wallet.balanceEv === "number") {
              display.balance = productCache.unscaleCurrencyAmount(currency, wallet.balanceEv);
              delete display.balanceEv;
            }
            if (typeof wallet.lockedBalanceEv === "number") {
              display.lockedBalance = productCache.unscaleCurrencyAmount(currency, wallet.lockedBalanceEv);
              delete display.lockedBalanceEv;
            }
            if (typeof wallet.lastUpdateTimeNs === "number") {
              display.lastUpdateTime = new Date(wallet.lastUpdateTimeNs / 1e6).toISOString();
              delete display.lastUpdateTimeNs;
            }
          } catch {
            // Keep Ev values as-is if currency unknown
          }
          return display;
        });
      }

      return {
        content: [{ type: "text" as const, text: `Spot wallets:\n${JSON.stringify(data, null, 2)}` }],
      };
    }
  );
}
