import { z } from "zod";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhemexClient } from "../client.js";
import { ProductInfoCache } from "../product-info.js";
import { ContractRouter } from "../contract-router.js";

export function registerPlaceOrder(server: McpServer, client: PhemexClient, productCache: ProductInfoCache) {
  server.tool(
    "place_order",
    "Place an order (USDT-M, Coin-M, or Spot). Returns order details on success. IMPORTANT: Verify order parameters carefully before calling.",
    {
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT (USDT-M/Spot) or BTCUSD (Coin-M)"),
      side: z.enum(["Buy", "Sell"]).describe("Order side"),
      orderQty: z.string().describe("Order quantity as decimal string, e.g. '0.01' (USDT-M) or integer contracts '10' (Coin-M)"),
      ordType: z.enum(["Market", "Limit", "Stop", "StopLimit"]).describe("Order type"),
      price: z.string().optional().describe("Limit price as decimal string, e.g. '1900'. Required for Limit/StopLimit orders"),
      timeInForce: z.enum(["GoodTillCancel", "ImmediateOrCancel", "FillOrKill", "PostOnly"])
        .optional().default("GoodTillCancel").describe("Time in force"),
      posSide: z.enum(["Long", "Short", "Merged"]).optional().default("Merged")
        .describe("Position side. Hedged mode: 'Long' or 'Short'. OneWay mode: 'Merged' (default)."),
      stopPx: z.string().optional().describe("Stop/trigger price as decimal string. Required for Stop/StopLimit"),
      triggerType: z.enum(["ByMarkPrice", "ByLastPrice"]).optional()
        .describe("Trigger type for Stop/StopLimit orders. Default: ByMarkPrice"),
      reduceOnly: z.boolean().optional().default(false).describe("Reduce-only order"),
      takeProfit: z.string().optional().describe("Take profit price as decimal string"),
      stopLoss: z.string().optional().describe("Stop loss price as decimal string"),
      contractType: z.enum(["linear", "inverse", "spot"]).optional().default("linear")
        .describe("Contract type: linear (USDT-M, default), inverse (Coin-M), or spot"),
      qtyType: z.enum(["ByBase", "ByQuote"]).optional().default("ByBase")
        .describe("Spot only: ByBase (default) specifies base currency qty, ByQuote specifies quote currency qty"),
    },
    async (params) => {
      const { symbol, contractType } = params;

      const symbolErr = ContractRouter.validateSymbol(contractType, symbol);
      if (symbolErr) {
        return { content: [{ type: "text" as const, text: `Error: ${symbolErr}` }], isError: true };
      }
      const resolved = ContractRouter.resolveSymbol(contractType, symbol);

      const clOrdID = "betta2moon" + crypto.randomUUID().replace(/-/g, "").slice(0, 30);
      const endpoint = ContractRouter.getEndpoint(contractType, "placeOrder");

      let queryParams: Record<string, string | number | boolean>;

      if (ContractRouter.isInverse(contractType)) {
        if (!productCache.isLoaded()) {
          return { content: [{ type: "text" as const, text: "Error: Product info not loaded. Coin-M requires product metadata for price scaling." }], isError: true };
        }

        queryParams = {
          symbol: resolved, clOrdID, side: params.side,
          orderQty: parseInt(params.orderQty),
          ordType: params.ordType, timeInForce: params.timeInForce,
        };
        if (params.price !== undefined) queryParams.priceEp = productCache.scalePrice(resolved, params.price);
        if (params.stopPx !== undefined) queryParams.stopPxEp = productCache.scalePrice(resolved, params.stopPx);
        if (params.takeProfit !== undefined) queryParams.takeProfitEp = productCache.scalePrice(resolved, params.takeProfit);
        if (params.stopLoss !== undefined) queryParams.stopLossEp = productCache.scalePrice(resolved, params.stopLoss);
        if (params.posSide !== undefined) queryParams.posSide = params.posSide;
        if (params.triggerType !== undefined) queryParams.triggerType = params.triggerType;
        if (params.reduceOnly) queryParams.reduceOnly = true;
      } else if (ContractRouter.isSpot(contractType)) {
        if (!productCache.isLoaded()) {
          return { content: [{ type: "text" as const, text: "Error: Product info not loaded. Spot requires product metadata for price/qty scaling." }], isError: true };
        }

        queryParams = {
          symbol: resolved, clOrdID, side: params.side,
          ordType: params.ordType, timeInForce: params.timeInForce,
          qtyType: params.qtyType ?? "ByBase",
        };
        if (params.qtyType === "ByQuote") {
          queryParams.quoteQtyEv = productCache.scaleValue(resolved, params.orderQty);
        } else {
          queryParams.baseQtyEv = productCache.scaleValue(resolved, params.orderQty);
        }
        if (params.price !== undefined) queryParams.priceEp = productCache.scalePrice(resolved, params.price);
        if (params.stopPx !== undefined) queryParams.stopPxEp = productCache.scalePrice(resolved, params.stopPx);
        if (params.triggerType !== undefined) queryParams.triggerType = params.triggerType;
      } else {
        // Linear: pass decimal strings as-is (existing behavior)
        queryParams = {
          symbol: resolved, clOrdID, side: params.side,
          orderQtyRq: params.orderQty,
          ordType: params.ordType, timeInForce: params.timeInForce,
          posSide: params.posSide ?? "Merged",
        };
        if (params.price !== undefined) queryParams.priceRp = params.price;
        if (params.stopPx !== undefined) queryParams.stopPxRp = params.stopPx;
        if (params.takeProfit !== undefined) queryParams.takeProfitRp = params.takeProfit;
        if (params.stopLoss !== undefined) queryParams.stopLossRp = params.stopLoss;
        if (params.triggerType !== undefined) queryParams.triggerType = params.triggerType;
        if (params.reduceOnly) queryParams.reduceOnly = true;
      }

      const res = await client.putWithQuery<unknown>(endpoint, queryParams);

      if (res.code !== 0) {
        return {
          content: [{ type: "text" as const, text: `Order FAILED: ${client.getErrorMessage(res.code, res.msg)}` }],
          isError: true,
        };
      }

      const responseData = (ContractRouter.isInverse(contractType) || ContractRouter.isSpot(contractType))
        ? productCache.convertResponse(resolved, res.data)
        : res.data;
      return {
        content: [{
          type: "text" as const,
          text: `Order placed successfully!\n${JSON.stringify(responseData, null, 2)}`,
        }],
      };
    }
  );
}
