import WebSocket from "ws";

const PHEMEX_WS_URL = process.env.PHEMEX_WS_URL || "wss://ws.phemex.com";

export class PhemexWebSocketClient {
  private ws: WebSocket | null = null;
  private subscriptions: Set<{ id: number; method: string; params: string[] }> = new Set();
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private closing = false;

  connect(): void {
    this.ws = new WebSocket(PHEMEX_WS_URL);

    this.ws.on("open", () => {
      this.log("info", "WebSocket connected");
      this.reconnectDelay = 1000;

      // Re-subscribe to previous channels
      for (const sub of this.subscriptions) {
        this.ws!.send(JSON.stringify(sub));
      }
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err) {
        this.log("error", "Failed to parse message", String(err));
      }
    });

    this.ws.on("error", (err: Error) => {
      this.log("error", "WebSocket error", err.message);
    });

    this.ws.on("close", () => {
      if (this.closing) return;
      this.log("warn", `Disconnected. Reconnecting in ${this.reconnectDelay}ms...`);
      setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
        this.connect();
      }, this.reconnectDelay);
    });
  }

  subscribe(channel: string, params: string[]): void {
    // Map user-friendly names to Phemex API channel names
    const channelMap: Record<string, string> = {
      ticker: "market24h",
      trade: "trade",
      orderbook: "orderbook",
    };

    const apiChannel = channelMap[channel] || channel;
    const subscription = {
      id: Date.now(),
      method: `${apiChannel}.subscribe`,
      params,
    };

    this.subscriptions.add(subscription);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(subscription));
      this.log("info", `Subscribed to ${apiChannel}: ${params.join(", ")}`);
    }
  }

  close(): void {
    this.closing = true;
    if (this.ws) this.ws.close();
  }

  private handleMessage(msg: Record<string, unknown>): void {
    if (msg.market24h || msg.ticker) {
      const data = (msg.market24h || msg.ticker) as Record<string, unknown>;
      console.log(JSON.stringify({
        type: "ticker",
        symbol: data.symbol,
        price: data.close || data.lastPrice,
        timestamp: data.timestamp,
        data,
      }));
    } else if (msg.trades) {
      console.log(JSON.stringify({
        type: "trades",
        symbol: msg.symbol,
        trades: msg.trades,
        timestamp: Date.now(),
      }));
    } else if (msg.orders) {
      console.log(JSON.stringify({
        type: "orders",
        orders: msg.orders,
        timestamp: Date.now(),
      }));
    } else if (msg.result !== undefined) {
      this.log("debug", "Subscription confirmed", JSON.stringify(msg));
    } else if (msg.error) {
      this.log("error", "API error", JSON.stringify(msg.error));
    }
  }

  private log(level: string, message: string, data?: string): void {
    const logMsg: Record<string, unknown> = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    if (data !== undefined) logMsg.data = data;
    process.stderr.write(JSON.stringify(logMsg) + "\n");
  }
}
