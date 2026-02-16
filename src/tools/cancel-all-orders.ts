import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerCancelAllOrders(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "cancel_all_orders",
    "Cancel ALL open orders for a symbol (USDT-M, Coin-M, or Spot). Use with caution!",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M/Spot) or BTCUSD (Coin-M)"),
      untriggered: z.boolean().optional().default(false)
        .describe("true=cancel conditional/stop orders, false=cancel active orders"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, untriggered, contractType }) => {
      const symbolErr = ContractRouter.validateSymbol(contractType, symbol);
      if (symbolErr) {
        return { content: [{ type: "text" as const, text: `Error: ${symbolErr}` }], isError: true };
      }
      const resolved = ContractRouter.resolveSymbol(contractType, symbol);

      const endpoint = ContractRouter.getEndpoint(contractType, "cancelAll");
      const params: Record<string, string | number | boolean> = { symbol: resolved };
      if (untriggered) params.untriggered = true;

      const res = await client.delete<unknown>(endpoint, params);
      if (res.code !== 0) {
        return { content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code)}` }], isError: true };
      }
      const responseData = (ContractRouter.isInverse(contractType) || ContractRouter.isSpot(contractType))
        ? productCache.convertResponse(resolved, res.data)
        : res.data;
      return { content: [{ type: "text" as const, text: `All orders cancelled for ${symbol}.\n${JSON.stringify(responseData, null, 2)}` }] };
    }
  );
}
