import { ProductInfo } from "./types.js";

export class ProductInfoCache {
  private readonly baseUrl: string;
  private cache = new Map<string, ProductInfo>();
  private loaded = false;
  private currencyScales = new Map<string, number>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async init(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/public/products`);
      const data = (await res.json()) as {
        code: number;
        data: {
          currencies?: RawCurrency[];
          products?: RawProduct[];
          perpProductsV2?: RawProductV2[];
        };
      };
      if (data.code !== 0) return;

      // Build currency valueScale lookup (valueScale in currencies is also an exponent)
      for (const c of data.data.currencies ?? []) {
        this.currencyScales.set(c.currency, Math.pow(10, c.valueScale));
      }

      // Inverse (Coin-M) and Spot products
      // priceScale and ratioScale are EXPONENTS (e.g., 4 means 10^4 = 10000)
      // Filter: only Listed products
      for (const p of data.data.products ?? []) {
        if (p.status !== "Listed") continue;

        if (p.type === "Perpetual") {
          const valueScale = this.currencyScales.get(p.settleCurrency) ?? Math.pow(10, 8);
          this.cache.set(p.symbol, {
            symbol: p.symbol,
            contractType: "inverse",
            priceScale: Math.pow(10, p.priceScale),
            ratioScale: Math.pow(10, p.ratioScale),
            valueScale,
            contractSize: Number(p.contractSize ?? 1),
          });
        } else if (p.type === "Spot") {
          const valueScale = this.currencyScales.get(p.settleCurrency) ?? Math.pow(10, 8);
          this.cache.set(p.symbol, {
            symbol: p.symbol,
            contractType: "spot",
            priceScale: Math.pow(10, p.priceScale),
            ratioScale: Math.pow(10, p.ratioScale),
            valueScale,
            contractSize: 1,
          });
        }
      }

      // Linear (USDT-M) products
      // These use decimal strings (Rp/Rq), scale values are 0 (10^0=1) — not used for linear
      for (const p of data.data.perpProductsV2 ?? []) {
        if (p.status === "Listed") {
          this.cache.set(p.symbol, {
            symbol: p.symbol,
            contractType: "linear",
            priceScale: p.priceScale ? Math.pow(10, p.priceScale) : 1,
            ratioScale: p.ratioScale ? Math.pow(10, p.ratioScale) : 1,
            valueScale: 1,
            contractSize: 1,
          });
        }
      }

      this.loaded = true;
    } catch {
      // Graceful failure — USDT-M tools still work without product info
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  get(symbol: string): ProductInfo | undefined {
    return this.cache.get(symbol);
  }

  scalePrice(symbol: string, decimal: string): number {
    const info = this.cache.get(symbol);
    if (!info) throw new Error(`No product info for ${symbol}`);
    return Math.round(parseFloat(decimal) * info.priceScale);
  }

  scaleRatio(symbol: string, decimal: string): number {
    const info = this.cache.get(symbol);
    if (!info) throw new Error(`No product info for ${symbol}`);
    return Math.round(parseFloat(decimal) * info.ratioScale);
  }

  scaleValue(symbol: string, decimal: string): number {
    const info = this.cache.get(symbol);
    if (!info) throw new Error(`No product info for ${symbol}`);
    return Math.round(parseFloat(decimal) * info.valueScale);
  }

  unscalePrice(symbol: string, scaled: number): string {
    const info = this.cache.get(symbol);
    if (!info) throw new Error(`No product info for ${symbol}`);
    return (scaled / info.priceScale).toString();
  }

  scaleCurrencyAmount(currency: string, decimal: string): number {
    const scale = this.currencyScales.get(currency);
    if (scale === undefined) throw new Error(`No currency info for ${currency}`);
    return Math.round(parseFloat(decimal) * scale);
  }

  unscaleCurrencyAmount(currency: string, amountEv: number): string {
    const scale = this.currencyScales.get(currency);
    if (scale === undefined) throw new Error(`No currency info for ${currency}`);
    return (amountEv / scale).toString();
  }

  convertResponse(symbol: string, data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) return data.map(item => this.convertResponse(symbol, item));
    if (typeof data !== "object") return data;

    const info = this.cache.get(symbol);
    if (!info) return data;

    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.endsWith("Ep") && typeof value === "number") {
        const baseName = key.slice(0, -2);
        result[baseName] = (value / info.priceScale).toString();
      } else if (key.endsWith("Er") && typeof value === "number") {
        const baseName = key.slice(0, -2);
        result[baseName] = (value / info.ratioScale).toString();
      } else if (key.endsWith("Ev") && typeof value === "number") {
        const baseName = key.slice(0, -2);
        result[baseName] = (value / info.valueScale).toString();
      } else if ((key + "Ep") in obj || (key + "Er") in obj || (key + "Ev") in obj) {
        // Skip plain keys that have a scaled Ep/Er/Ev sibling (e.g., skip "price" if "priceEp" exists)
        continue;
      } else if (value !== null && typeof value === "object") {
        result[key] = this.convertResponse(symbol, value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}

interface RawCurrency {
  currency: string;
  valueScale: number;
}

interface RawProduct {
  symbol: string;
  type: string;
  status: string;
  settleCurrency: string;
  priceScale: number;
  ratioScale: number;
  contractSize?: number;
}

interface RawProductV2 {
  symbol: string;
  type: string;
  status: string;
  settleCurrency: string;
  priceScale: number;
  ratioScale: number;
}
