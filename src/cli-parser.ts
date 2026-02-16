/**
 * Parse CLI arguments into a key-value params object.
 *
 * Supports two modes:
 * 1. Flag style: --key value --key2 value2
 * 2. JSON style: '{"key":"value"}'
 *
 * Numeric strings that look like integers are coerced to numbers.
 * "true"/"false" are coerced to booleans.
 * Decimal strings (containing ".") stay as strings (for price/qty params).
 */
export function parseCliArgs(args: string[]): Record<string, unknown> {
  if (args.length === 0) return {};

  // JSON mode: single arg starting with {
  if (args.length === 1 && args[0].startsWith("{")) {
    return JSON.parse(args[0]);
  }

  // Flag mode: --key value pairs
  const result: Record<string, unknown> = {};
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      i++;
      continue;
    }
    const key = arg.slice(2);
    const nextArg = args[i + 1];

    // Flag with no value (or next arg is another flag) → true
    if (nextArg === undefined || nextArg.startsWith("--")) {
      result[key] = true;
      i++;
      continue;
    }

    result[key] = coerce(nextArg);
    i += 2;
  }
  return result;
}

function coerce(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  // Integer (no decimal point) → number
  if (/^-?\d+$/.test(value)) return Number(value);
  // Everything else stays as string (including decimals like "0.01", "95000.50")
  return value;
}
