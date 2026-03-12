import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface AppConfig {
  apiKey: string;
  apiSecret: string;
  apiUrl: string;
  maxOrderValue?: number;
}

/**
 * Load config from ~/.phemexrc file.
 * Parses KEY=VALUE lines, ignoring comments (#) and blank lines.
 * Returns a record of the parsed values.
 */
export function loadRcFile(filePath?: string): Record<string, string> {
  const rcPath = filePath ?? path.join(os.homedir(), ".phemexrc");
  const result: Record<string, string> = {};

  if (!fs.existsSync(rcPath)) return result;

  const content = fs.readFileSync(rcPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key) result[key] = value;
  }

  return result;
}

/**
 * Load configuration with priority:
 * 1. CLI params (passed in via overrides)
 * 2. Environment variables
 * 3. ~/.phemexrc file
 * 4. Defaults (testnet)
 */
export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  const rcValues = loadRcFile();

  // Apply rc file values as fallback env vars (don't overwrite existing env vars)
  for (const [key, value] of Object.entries(rcValues)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  return {
    apiKey: overrides?.apiKey ?? process.env.PHEMEX_API_KEY ?? "",
    apiSecret: overrides?.apiSecret ?? process.env.PHEMEX_API_SECRET ?? "",
    apiUrl: overrides?.apiUrl ?? process.env.PHEMEX_API_URL ?? "https://testnet-api.phemex.com",
    maxOrderValue: overrides?.maxOrderValue ??
      (process.env.PHEMEX_MAX_ORDER_VALUE ? Number(process.env.PHEMEX_MAX_ORDER_VALUE) : undefined),
  };
}
