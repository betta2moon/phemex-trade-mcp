import crypto from "node:crypto";
import { PhemexConfig, PhemexResponse, PhemexMdResponse, PHEMEX_ERRORS } from "./types.js";

export class PhemexClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  readonly maxOrderValue: number;

  constructor(config: PhemexConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl;
    this.maxOrderValue = config.maxOrderValue ?? 100;
  }

  private sign(message: string): string {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(message)
      .digest("hex");
  }

  private getExpiry(): number {
    return Math.floor(Date.now() / 1000) + 60;
  }

  private buildQueryParams(params: Record<string, string | number | boolean>): string {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return entries.join("&");
  }

  private authHeaders(expiry: number, signature: string): Record<string, string> {
    return {
      "x-phemex-access-token": this.apiKey,
      "x-phemex-request-expiry": String(expiry),
      "x-phemex-request-signature": signature,
    };
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<PhemexResponse<T>> {
    const qp = params ? this.buildQueryParams(params) : "";
    const expiry = this.getExpiry();
    const signature = this.sign(path + qp + expiry);

    const url = `${this.baseUrl}${path}${qp ? "?" + qp : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.authHeaders(expiry, signature),
    });

    return (await response.json()) as PhemexResponse<T>;
  }

  async getPublic<T>(path: string, params?: Record<string, string | number | boolean>): Promise<PhemexResponse<T>> {
    const qp = params ? this.buildQueryParams(params) : "";
    const url = `${this.baseUrl}${path}${qp ? "?" + qp : ""}`;

    const response = await fetch(url, {
      method: "GET",
    });

    return (await response.json()) as PhemexResponse<T>;
  }

  async getPublicMd<T>(path: string, params?: Record<string, string | number | boolean>): Promise<PhemexMdResponse<T>> {
    const qp = params ? this.buildQueryParams(params) : "";
    const url = `${this.baseUrl}${path}${qp ? "?" + qp : ""}`;

    const response = await fetch(url, {
      method: "GET",
    });

    return (await response.json()) as PhemexMdResponse<T>;
  }

  async put<T>(path: string, body: Record<string, unknown>): Promise<PhemexResponse<T>> {
    const expiry = this.getExpiry();
    const jsonBody = JSON.stringify(body);
    const signature = this.sign(path + expiry + jsonBody);

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...this.authHeaders(expiry, signature),
        "Content-Type": "application/json",
      },
      body: jsonBody,
    });

    return (await response.json()) as PhemexResponse<T>;
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<PhemexResponse<T>> {
    const expiry = this.getExpiry();
    const jsonBody = JSON.stringify(body);
    const signature = this.sign(path + expiry + jsonBody);

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.authHeaders(expiry, signature),
        "Content-Type": "application/json",
      },
      body: jsonBody,
    });

    return (await response.json()) as PhemexResponse<T>;
  }

  async putWithQuery<T>(path: string, params: Record<string, string | number | boolean>): Promise<PhemexResponse<T>> {
    const qp = this.buildQueryParams(params);
    const expiry = this.getExpiry();
    const signature = this.sign(path + qp + expiry);

    const url = `${this.baseUrl}${path}${qp ? "?" + qp : ""}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: this.authHeaders(expiry, signature),
    });

    return (await response.json()) as PhemexResponse<T>;
  }

  async delete<T>(path: string, params?: Record<string, string | number | boolean>): Promise<PhemexResponse<T>> {
    const qp = params ? this.buildQueryParams(params) : "";
    const expiry = this.getExpiry();
    const signature = this.sign(path + qp + expiry);

    const url = `${this.baseUrl}${path}${qp ? "?" + qp : ""}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.authHeaders(expiry, signature),
    });

    return (await response.json()) as PhemexResponse<T>;
  }

  getErrorMessage(code: number, msg?: string): string {
    if (msg) return msg;
    return PHEMEX_ERRORS[code] ?? `Unknown error (code: ${code})`;
  }
}
