import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadRcFile, loadConfig } from "../config.js";

// Save and restore env vars
const ENV_KEYS = ["PHEMEX_API_KEY", "PHEMEX_API_SECRET", "PHEMEX_API_URL", "PHEMEX_MAX_ORDER_VALUE"];
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

describe("loadRcFile", () => {
  it("returns empty object when file does not exist", () => {
    const result = loadRcFile("/tmp/__nonexistent_phemexrc__");
    expect(result).toEqual({});
  });

  it("parses KEY=VALUE lines", () => {
    const tmpFile = path.join(os.tmpdir(), ".phemexrc_test_" + Date.now());
    fs.writeFileSync(tmpFile, "PHEMEX_API_KEY=my-key\nPHEMEX_API_SECRET=my-secret\n");
    try {
      const result = loadRcFile(tmpFile);
      expect(result.PHEMEX_API_KEY).toBe("my-key");
      expect(result.PHEMEX_API_SECRET).toBe("my-secret");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("ignores comments and blank lines", () => {
    const tmpFile = path.join(os.tmpdir(), ".phemexrc_test_" + Date.now());
    fs.writeFileSync(tmpFile, "# This is a comment\n\nPHEMEX_API_KEY=val\n# Another comment\n");
    try {
      const result = loadRcFile(tmpFile);
      expect(Object.keys(result)).toEqual(["PHEMEX_API_KEY"]);
      expect(result.PHEMEX_API_KEY).toBe("val");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("handles values with = signs", () => {
    const tmpFile = path.join(os.tmpdir(), ".phemexrc_test_" + Date.now());
    fs.writeFileSync(tmpFile, "PHEMEX_API_SECRET=abc=def=ghi\n");
    try {
      const result = loadRcFile(tmpFile);
      expect(result.PHEMEX_API_SECRET).toBe("abc=def=ghi");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe("loadConfig", () => {
  it("returns defaults when no env vars or rc file", () => {
    const config = loadConfig();
    expect(config.apiKey).toBe("");
    expect(config.apiSecret).toBe("");
    expect(config.apiUrl).toBe("https://testnet-api.phemex.com");
    expect(config.maxOrderValue).toBeUndefined();
  });

  it("reads from env vars", () => {
    process.env.PHEMEX_API_KEY = "env-key";
    process.env.PHEMEX_API_SECRET = "env-secret";
    process.env.PHEMEX_API_URL = "https://api.phemex.com";
    process.env.PHEMEX_MAX_ORDER_VALUE = "500";

    const config = loadConfig();
    expect(config.apiKey).toBe("env-key");
    expect(config.apiSecret).toBe("env-secret");
    expect(config.apiUrl).toBe("https://api.phemex.com");
    expect(config.maxOrderValue).toBe(500);
  });

  it("overrides take highest priority", () => {
    process.env.PHEMEX_API_KEY = "env-key";
    const config = loadConfig({ apiKey: "override-key" });
    expect(config.apiKey).toBe("override-key");
  });
});
