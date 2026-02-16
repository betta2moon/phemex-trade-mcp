import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";

const TRANSFER_STATUS: Record<number, string> = {
  3: "Rejected",
  6: "Error (waiting for recovery)",
  10: "Success",
  11: "Failed",
};

export function registerTransferFunds(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "transfer_funds",
    "Transfer funds between spot wallet and futures trading account",
    {
      currency: z.string().describe("Currency to transfer, e.g. 'BTC', 'USDT', 'ETH'"),
      amount: z.string().describe("Amount as decimal string, e.g. '1.5'"),
      direction: z.enum(["spot_to_futures", "futures_to_spot"])
        .describe("Transfer direction"),
    },
    async ({ currency, amount, direction }) => {
      if (!productCache.isLoaded()) {
        return {
          content: [{ type: "text" as const, text: "Error: Product info not loaded. Cannot determine currency scale." }],
          isError: true,
        };
      }

      let amountEv: number;
      try {
        amountEv = productCache.scaleCurrencyAmount(currency, amount);
      } catch {
        return {
          content: [{ type: "text" as const, text: `Error: Unknown currency '${currency}'. Cannot determine scale factor.` }],
          isError: true,
        };
      }

      const moveOp = direction === "spot_to_futures" ? 2 : 1;

      const res = await client.post<unknown>("/assets/transfer", {
        amountEv,
        currency,
        moveOp,
      });

      if (res.code !== 0) {
        return {
          content: [{ type: "text" as const, text: `Transfer failed: ${client.getErrorMessage(res.code)}` }],
          isError: true,
        };
      }

      // Convert amountEv in response for readability
      const data = res.data as Record<string, unknown>;
      const displayData = { ...data };
      if (typeof data.amountEv === "number") {
        displayData.amount = productCache.unscaleCurrencyAmount(currency, data.amountEv);
        delete displayData.amountEv;
      }
      if (typeof data.status === "number") {
        displayData.statusText = TRANSFER_STATUS[data.status] ?? "Processing";
      }

      const dirLabel = direction === "spot_to_futures" ? "Spot → Futures" : "Futures → Spot";
      return {
        content: [{
          type: "text" as const,
          text: `Transfer ${dirLabel}: ${amount} ${currency}\n${JSON.stringify(displayData, null, 2)}`,
        }],
      };
    }
  );
}
