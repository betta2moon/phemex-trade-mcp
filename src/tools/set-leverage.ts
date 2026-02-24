import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerSetLeverage(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "set_leverage",
    "Set leverage for a perpetual symbol (USDT-M or Coin-M). Negative=cross margin, positive=isolated, 0=max cross.",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M) or BTCUSD (Coin-M)"),
      leverage: z.number().describe("Leverage value. Positive=isolated, negative=cross margin, 0=max leverage cross mode"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, leverage, contractType }) => {
      if (ContractRouter.isSpot(contractType)) {
        return { content: [{ type: "text" as const, text: "Error: Spot does not support leverage." }], isError: true };
      }
      const symbolErr = ContractRouter.validateSymbol(contractType, symbol);
      if (symbolErr) {
        return { content: [{ type: "text" as const, text: `Error: ${symbolErr}` }], isError: true };
      }

      const endpoint = ContractRouter.getEndpoint(contractType, "setLeverage");
      const params: Record<string, string | number | boolean> = { symbol };

      if (ContractRouter.isInverse(contractType)) {
        if (!productCache.isLoaded()) {
          return { content: [{ type: "text" as const, text: "Error: Product info not loaded. Coin-M requires product metadata for price scaling." }], isError: true };
        }
        params.leverageEr = productCache.scaleRatio(symbol, String(leverage));
      } else {
        params.leverageRr = leverage;
      }

      const res = await client.putWithQuery<unknown>(endpoint, params);
      if (res.code !== 0) {
        return { content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code, res.msg)}` }], isError: true };
      }
      const responseData = ContractRouter.isInverse(contractType)
        ? productCache.convertResponse(symbol, res.data)
        : res.data;
      return { content: [{ type: "text" as const, text: `Leverage set to ${leverage}x for ${symbol}.\n${JSON.stringify(responseData, null, 2)}` }] };
    }
  );
}
