import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerSwitchPosMode(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "switch_pos_mode",
    "Switch position mode between OneWay and Hedged for a USDT-M perpetual symbol. Note: Coin-M (inverse) contracts do not support position mode switching via API.",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M) or BTCUSD (Coin-M)"),
      targetPosMode: z.enum(["OneWay", "Hedged"]).describe("Target position mode"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
    },
    async ({ symbol, targetPosMode, contractType }) => {
      if (ContractRouter.isSpot(contractType)) {
        return { content: [{ type: "text" as const, text: "Error: Spot does not have position modes." }], isError: true };
      }
      if (ContractRouter.isInverse(contractType)) {
        return { content: [{ type: "text" as const, text: "Error: Position mode switching is not supported for Coin-M (inverse) contracts via API. Use the Phemex web interface instead." }], isError: true };
      }

      const symbolErr = ContractRouter.validateSymbol(contractType, symbol);
      if (symbolErr) {
        return { content: [{ type: "text" as const, text: `Error: ${symbolErr}` }], isError: true };
      }

      const endpoint = ContractRouter.getEndpoint(contractType, "switchPosMode");
      const res = await client.putWithQuery<unknown>(endpoint, {
        symbol,
        targetPosMode,
      });
      if (res.code !== 0) {
        return { content: [{ type: "text" as const, text: `Error: ${client.getErrorMessage(res.code, res.msg)}` }], isError: true };
      }
      const responseData = ContractRouter.isInverse(contractType)
        ? productCache.convertResponse(symbol, res.data)
        : res.data;
      return { content: [{ type: "text" as const, text: `Position mode switched to ${targetPosMode} for ${symbol}.\n${JSON.stringify(responseData, null, 2)}` }] };
    }
  );
}
