import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PhemexClient } from "./client.js";
import { ProductInfoCache } from "./product-info.js";
import { registerGetTicker } from "./tools/get-ticker.js";
import { registerGetOrderbook } from "./tools/get-orderbook.js";
import { registerGetKlines } from "./tools/get-klines.js";
import { registerGetRecentTrades } from "./tools/get-recent-trades.js";
import { registerGetFundingRate } from "./tools/get-funding-rate.js";
import { registerGetAccount } from "./tools/get-account.js";
import { registerGetPositions } from "./tools/get-positions.js";
import { registerGetOpenOrders } from "./tools/get-open-orders.js";
import { registerGetOrderHistory } from "./tools/get-order-history.js";
import { registerGetTrades } from "./tools/get-trades.js";
import { registerPlaceOrder } from "./tools/place-order.js";
import { registerCancelOrder } from "./tools/cancel-order.js";
import { registerAmendOrder } from "./tools/amend-order.js";
import { registerCancelAllOrders } from "./tools/cancel-all-orders.js";
import { registerSetLeverage } from "./tools/set-leverage.js";
import { registerSwitchPosMode } from "./tools/switch-pos-mode.js";
import { registerTransferFunds } from "./tools/transfer-funds.js";
import { registerGetTransferHistory } from "./tools/get-transfer-history.js";
import { registerGetSpotWallet } from "./tools/get-spot-wallet.js";

const apiKey = process.env.PHEMEX_API_KEY ?? "";
const apiSecret = process.env.PHEMEX_API_SECRET ?? "";
const baseUrl = process.env.PHEMEX_API_URL ?? "https://testnet-api.phemex.com";
const maxOrderValue = process.env.PHEMEX_MAX_ORDER_VALUE
  ? Number(process.env.PHEMEX_MAX_ORDER_VALUE)
  : undefined;

const client = new PhemexClient({ apiKey, apiSecret, baseUrl, maxOrderValue });

const productCache = new ProductInfoCache(baseUrl);
await productCache.init();

const server = new McpServer({
  name: "phemex-trade-mcp",
  version: "0.1.0",
});

// Register market data tools
registerGetTicker(server, client, productCache);
registerGetOrderbook(server, client, productCache);
registerGetKlines(server, client, productCache);
registerGetRecentTrades(server, client, productCache);
registerGetFundingRate(server, client, productCache);

// Register account read tools
registerGetAccount(server, client, productCache);
registerGetPositions(server, client, productCache);
registerGetOpenOrders(server, client, productCache);
registerGetOrderHistory(server, client, productCache);
registerGetTrades(server, client, productCache);

// Register trading tools
registerPlaceOrder(server, client, productCache);
registerCancelOrder(server, client, productCache);
registerAmendOrder(server, client, productCache);
registerCancelAllOrders(server, client, productCache);
registerSetLeverage(server, client, productCache);
registerSwitchPosMode(server, client, productCache);

// Register transfer tools
registerTransferFunds(server, client, productCache);
registerGetTransferHistory(server, client, productCache);

// Register spot-only tools
registerGetSpotWallet(server, client, productCache);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
