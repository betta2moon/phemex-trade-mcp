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

export function registerGetTransferHistory(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "get_transfer_history",
    "Query transfer history between spot and futures accounts",
    {
      currency: z.string().describe("Currency to query, e.g. 'BTC', 'USDT'"),
      direction: z.enum(["spot_to_futures", "futures_to_spot"]).optional()
        .describe("Filter by direction. Omit to show both directions."),
      limit: z.number().min(1).max(200).optional().default(20)
        .describe("Max results (default 20, max 200)"),
    },
    async ({ currency, direction, limit }) => {
      const params: Record<string, string | number | boolean> = { currency, limit };

      const res = await client.get<unknown>("/assets/transfer", params);

      if (res.code !== 0) {
        return {
          content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code)}` }],
          isError: true,
        };
      }

      // API returns { rows: [...] }, not a plain array
      const resData = res.data as Record<string, unknown>;
      let rawRows: Record<string, unknown>[] = Array.isArray(resData?.rows) ? resData.rows : (Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : []);

      // Client-side direction filter (API doesn't reliably filter by side/bizType)
      if (direction !== undefined) {
        const targetBizType = direction === "spot_to_futures" ? 10 : 11;
        rawRows = rawRows.filter(row => row.bizType === targetBizType);
      }

      const displayRows = rawRows.map((row: Record<string, unknown>) => {
        const display = { ...row };
        if (typeof row.amountEv === "number" && productCache.isLoaded()) {
          try {
            display.amount = productCache.unscaleCurrencyAmount(currency, row.amountEv);
            delete display.amountEv;
          } catch {
            // Keep amountEv as-is if currency unknown
          }
        }
        // bizType is the reliable direction indicator (side is always 0)
        if (typeof row.bizType === "number") {
          display.direction = row.bizType === 10 ? "spot_to_futures" : "futures_to_spot";
        }
        if (typeof row.status === "number") {
          display.statusText = TRANSFER_STATUS[row.status] ?? "Processing";
        }
        return display;
      });

      if (displayRows.length === 0) {
        return { content: [{ type: "text" as const, text: `No transfer history for ${currency}.` }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Transfer history (${currency}):\n${JSON.stringify(displayRows, null, 2)}`,
        }],
      };
    }
  );
}
