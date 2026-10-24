import type { DailyReport, GuestResponse, MenuResponse, ReadyResponse } from "./contracts";

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
  csv(day: string, signal?: AbortSignal): Promise<Blob>;
}
async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  let error;
  try { error = (await response.json()).error; } catch { /* Do not expose raw HTML/server errors. */ }
  throw new ApiError(error?.code ?? "UNAVAILABLE", error?.message ?? "The service is unavailable. Please try again.", response.status);
}
export function createHttpAdapters(fetcher: typeof fetch = fetch): PublicAdapter & LeadAdapter {
  async function get<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await checked(await fetcher(url, { cache: "no-store", credentials: "same-origin", ...init }));
    return response.json();
  }
  return {
    guest: (token, signal) => get("/api/guest/status", { signal, headers: { Authorization: `Bearer ${token}` } }),
    ready: (signal) => get("/api/ready", { signal }),
    menu: (signal) => get("/api/menu", { signal }),
    report: (day, signal) => get(`/api/lead/reports?day=${encodeURIComponent(day)}`, { signal }),
    csv: async (day, signal) => (await checked(await fetcher(`/api/lead/reports.csv?day=${encodeURIComponent(day)}`, { cache: "no-store", credentials: "same-origin", signal }))).blob(),
  };
}
export const httpAdapters = createHttpAdapters();

/** Token never enters a query string, persistent browser storage, cache key or API URL. */
export function tokenFromFragment(fragment: string): string | null {
  if (!fragment.startsWith("#")) return null;
  const token = new URLSearchParams(fragment.replace(/^#/, "")).get("token");
  return token && /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : null;
}
