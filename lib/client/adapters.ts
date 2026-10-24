import type { DailyReport, GuestOrder, GuestResponse, MenuItem, MenuResponse, ReadyResponse } from "./contracts";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); this.name = "ApiError"; }
}
export interface PublicAdapter {
  guest(token: string, signal?: AbortSignal): Promise<GuestResponse>;
  ready(signal?: AbortSignal): Promise<ReadyResponse>;
}
export interface LeadAdapter {
  menu(signal?: AbortSignal): Promise<MenuResponse>;
  report(day: string, signal?: AbortSignal): Promise<DailyReport>;
  csv(day: string, signal?: AbortSignal): Promise<{ blob: Blob; reconciliationComplete: boolean }>;
}
async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  let error;
  try { error = (await response.json()).error; } catch { /* Do not expose raw HTML/server errors. */ }
  throw new ApiError(error?.code ?? "UNAVAILABLE", error?.message ?? "The service is unavailable. Please try again.", response.status);
}
export function createHttpAdapters(fetcher: typeof fetch = fetch, staffToken?: () => Promise<string | null>): PublicAdapter & LeadAdapter {
  async function staffHeaders(): Promise<Headers> {
    const headers = new Headers(); const token = await staffToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  }
  async function get<T>(url: string, init: RequestInit = {}, staff = false): Promise<T> {
    const response = await checked(await fetcher(url, { cache: "no-store", credentials: "same-origin", ...(staff ? { headers: await staffHeaders() } : {}), ...init }));
    return response.json();
  }
  return {
    guest: async (token, signal) => {
      const response = await checked(await fetcher("/api/guest/status", { cache: "no-store", credentials: "same-origin", signal, headers: { Authorization: `Bearer ${token}` } }));
      const data = await response.json();
      // Person 1's first persisted API returns bare GuestStatus, without an envelope.
      return data.order ? data as GuestResponse : { order: data as GuestOrder, syncedAt: response.headers.get("Date") ?? "" };
    },
    ready: async signal => {
      const response = await checked(await fetcher("/api/ready", { cache: "no-store", credentials: "same-origin", signal }));
      const data = await response.json();
      return { orders: data.orders, syncedAt: data.syncedAt ?? data.updatedAt ?? response.headers.get("Date") ?? "" };
    },
    menu: async signal => {
      const response = await checked(await fetcher("/api/menu", { cache: "no-store", credentials: "same-origin", signal, headers: await staffHeaders() }));
      const data = await response.json();
      return { items: data.items, revision: data.revision ?? Math.max(0, ...data.items.map((item: MenuItem) => item.revision)), syncedAt: data.syncedAt ?? response.headers.get("Date") ?? "" };
    },
    report: (day, signal) => get(`/api/lead/reports?day=${encodeURIComponent(day)}`, { signal }, true),
    csv: async (day, signal) => {
      const response = await checked(await fetcher(`/api/lead/reports.csv?day=${encodeURIComponent(day)}`, { cache: "no-store", credentials: "same-origin", headers: await staffHeaders(), signal }));
      return { blob: await response.blob(), reconciliationComplete: response.headers.get("X-Reconciliation-Complete") === "true" };
    },
  };
}
export const httpAdapters = createHttpAdapters();

/** Token never enters a query string, persistent browser storage, cache key or API URL. */
export function tokenFromFragment(fragment: string): string | null {
  if (!fragment.startsWith("#")) return null;
  // Existing order-entry QR links use #<64 hex chars>; named fragments are also supported.
  if (/^#[a-f0-9]{64}$/.test(fragment)) return fragment.slice(1);
  const token = new URLSearchParams(fragment.replace(/^#/, "")).get("token");
  return token && /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : null;
}
