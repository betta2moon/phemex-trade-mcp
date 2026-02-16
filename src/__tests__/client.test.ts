import { describe, it, expect, vi, beforeEach } from "vitest";
import { PhemexClient } from "../client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("PhemexClient", () => {
  let client: PhemexClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new PhemexClient({
      apiKey: "test-key",
      apiSecret: "test-secret",
      baseUrl: "https://api.phemex.com",
    });
  });

  it("post() sends POST with JSON body and auth headers", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ code: 0, msg: "OK", data: { id: 1 } }),
    });

    const result = await client.post("/assets/transfer", {
      amountEv: 150000000,
      currency: "BTC",
      moveOp: 2,
    });

    expect(result.code).toBe(0);
    expect(result.data).toEqual({ id: 1 });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.phemex.com/assets/transfer");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["x-phemex-access-token"]).toBe("test-key");
    expect(opts.headers["x-phemex-request-expiry"]).toBeDefined();
    expect(opts.headers["x-phemex-request-signature"]).toBeDefined();
    expect(JSON.parse(opts.body)).toEqual({
      amountEv: 150000000,
      currency: "BTC",
      moveOp: 2,
    });
  });
});
