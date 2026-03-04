import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

let wsInstances: MockWS[] = [];
let autoOpen = true;

class MockWS extends EventEmitter {
  static OPEN = 1;
  readyState = 1;
  send = vi.fn();
  close = vi.fn();

  constructor(_url: string) {
    super();
    wsInstances.push(this);
    if (autoOpen) setTimeout(() => this.emit("open"), 0);
  }
}

vi.mock("ws", () => ({ default: MockWS }));

const { PhemexWebSocketClient } = await import("../websocket-client.js");

describe("PhemexWebSocketClient", () => {
  let client: InstanceType<typeof PhemexWebSocketClient>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances = [];
    autoOpen = true;
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(console, "log").mockImplementation(() => {});
    client = new PhemexWebSocketClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function ws(index = 0): MockWS {
    return wsInstances[index];
  }

  it("connects and logs on open", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);

    expect(wsInstances).toHaveLength(1);
    const log = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(log).toMatchObject({ level: "info", message: "WebSocket connected" });
  });

  it("maps ticker → market24h.subscribe", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    client.subscribe("ticker", ["BTCUSDT"]);

    const sent = JSON.parse(ws().send.mock.calls[0][0]);
    expect(sent.method).toBe("market24h.subscribe");
    expect(sent.params).toEqual(["BTCUSDT"]);
  });

  it("maps trade → trade.subscribe", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    client.subscribe("trade", ["SOLUSDT"]);

    const sent = JSON.parse(ws().send.mock.calls[0][0]);
    expect(sent.method).toBe("trade.subscribe");
  });

  it("maps orderbook → orderbook.subscribe", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    client.subscribe("orderbook", ["ETHUSDT"]);

    const sent = JSON.parse(ws().send.mock.calls[0][0]);
    expect(sent.method).toBe("orderbook.subscribe");
  });

  it("passes unknown channel names through", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    client.subscribe("kline", ["BTCUSDT"]);

    const sent = JSON.parse(ws().send.mock.calls[0][0]);
    expect(sent.method).toBe("kline.subscribe");
  });

  it("outputs ticker data to stdout", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);

    ws().emit("message", JSON.stringify({
      market24h: { symbol: "BTCUSDT", close: 95000.5, timestamp: 1709514843 },
    }));

    const output = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(output).toMatchObject({ type: "ticker", symbol: "BTCUSDT", price: 95000.5 });
  });

  it("outputs trades data to stdout", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);

    ws().emit("message", JSON.stringify({
      symbol: "SOLUSDT",
      trades: [{ price: 150.2, qty: 10 }],
    }));

    const output = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(output).toMatchObject({ type: "trades", symbol: "SOLUSDT" });
    expect(output.trades).toHaveLength(1);
  });

  it("logs subscription confirmation to stderr", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    stderrSpy.mockClear();

    ws().emit("message", JSON.stringify({ result: "success", id: 123 }));

    const log = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(log).toMatchObject({ level: "debug", message: "Subscription confirmed" });
  });

  it("logs API errors to stderr", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    stderrSpy.mockClear();

    ws().emit("message", JSON.stringify({ error: { code: 400, message: "Bad request" } }));

    const log = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(log).toMatchObject({ level: "error", message: "API error" });
  });

  it("re-subscribes on reconnect", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    client.subscribe("ticker", ["BTCUSDT"]);

    ws(0).emit("close");
    await vi.advanceTimersByTimeAsync(1001);

    expect(wsInstances).toHaveLength(2);
    const reSent = JSON.parse(ws(1).send.mock.calls[0][0]);
    expect(reSent.method).toBe("market24h.subscribe");
    expect(reSent.params).toEqual(["BTCUSDT"]);
  });

  it("does not reconnect after close()", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);

    client.close();
    ws().emit("close");
    await vi.advanceTimersByTimeAsync(35000);

    expect(wsInstances).toHaveLength(1);
  });

  it("uses exponential backoff when connection keeps failing", async () => {
    // Disable auto-open to simulate failed connections
    autoOpen = false;

    client.connect();
    // Manually open the first connection
    ws(0).emit("open");

    client.subscribe("ticker", ["BTCUSDT"]);

    // First disconnect: 1000ms delay
    ws(0).emit("close");
    await vi.advanceTimersByTimeAsync(999);
    expect(wsInstances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(wsInstances).toHaveLength(2);
    // reconnectDelay is now 1500 (1000 * 1.5), open never fires so it stays

    // Second disconnect (without open): 1500ms delay
    ws(1).emit("close");
    await vi.advanceTimersByTimeAsync(1499);
    expect(wsInstances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(wsInstances).toHaveLength(3);
  });

  it("resets backoff delay on successful reconnect", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1); // open fires, delay reset to 1000

    ws(0).emit("close");
    await vi.advanceTimersByTimeAsync(1001); // reconnects, delay was bumped to 1500 inside timeout

    // open fires for ws(1), delay resets to 1000
    // Second disconnect should use 1000ms delay again
    ws(1).emit("close");
    await vi.advanceTimersByTimeAsync(999);
    expect(wsInstances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(wsInstances).toHaveLength(3);
  });

  it("handles malformed messages gracefully", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    stderrSpy.mockClear();

    ws().emit("message", "not valid json{{{");

    const log = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(log).toMatchObject({ level: "error", message: "Failed to parse message" });
  });

  it("logs WebSocket errors to stderr", async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(1);
    stderrSpy.mockClear();

    ws().emit("error", new Error("connection refused"));

    const log = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(log).toMatchObject({ level: "error", message: "WebSocket error" });
  });
});
