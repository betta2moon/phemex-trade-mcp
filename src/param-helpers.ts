/**
 * Type-safe parameter extraction helpers for CLI parsed args.
 *
 * These handle the fact that `parseCliArgs` coerces integer strings to numbers,
 * so params like --price 100000 arrive as `number` rather than `string`.
 * Helpers accept both types and always return strings where needed.
 */

export function requireString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v === "number") return String(v);
  if (typeof v !== "string" || v === "") throw new Error(`Missing required parameter: --${key}`);
  return v;
}

export function optString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

export function optNumber(params: Record<string, unknown>, key: string, defaultVal?: number): number | undefined {
  const v = params[key];
  if (v === undefined) return defaultVal;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); if (!isNaN(n)) return n; }
  throw new Error(`Parameter --${key} must be a number`);
}

export function requireNumber(params: Record<string, unknown>, key: string): number {
  const v = optNumber(params, key);
  if (v === undefined) throw new Error(`Missing required parameter: --${key}`);
  return v;
}

export function optBool(params: Record<string, unknown>, key: string, defaultVal = false): boolean {
  const v = params[key];
  if (v === undefined) return defaultVal;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return defaultVal;
}
