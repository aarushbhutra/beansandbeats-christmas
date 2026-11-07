"use client";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Fetch with a hard deadline that also covers reading the body (half-open Wi-Fi can stall). */
export async function api<T>(path: string, init: RequestInit & { timeoutMs?: number; raw?: boolean } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 12_000);
  const signal = init.signal ? anySignal([init.signal, controller.signal]) : controller.signal;
  try {
    const response = await fetch(path, {
      ...init,
      signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...(init.headers as Record<string, string> | undefined) },
    });
    if (!response.ok) {
      let code = "UNAVAILABLE", message = response.status >= 500 ? "The server is having a moment. Saved work stays on this device." : "Request failed.";
      try { const body = await response.json(); code = body?.error?.code ?? code; message = body?.error?.message ?? message; } catch { /* non-JSON */ }
      throw new ApiError(response.status, code, message);
    }
    if (init.raw) return response as unknown as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, "NETWORK", navigator.onLine ? "Can't reach the server right now." : "You're offline.");
  } finally {
    clearTimeout(timer);
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) { controller.abort(); break; }
    s.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export const post = <T,>(path: string, body: unknown, init: RequestInit = {}) => api<T>(path, { ...init, method: "POST", body: JSON.stringify(body) });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });

/**
 * Minimal Server-Sent Events client on top of fetch, so auth can ride in headers.
 * Reconnects with capped exponential backoff until closed.
 */
export function subscribe(url: string, handlers: { headers?: Record<string, string>; onEvent: (event: string, data: unknown) => void; onState?: (state: "open" | "retrying" | "closed") => void; onFatal?: (status: number) => void }): () => void {
  let closed = false;
  let attempt = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function connect() {
    if (closed) return;
    controller = new AbortController();
    try {
      const response = await fetch(url, { headers: { Accept: "text/event-stream", ...handlers.headers }, cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (response.status === 401 || response.status === 403 || response.status === 404) { handlers.onFatal?.(response.status); closed = true; handlers.onState?.("closed"); return; }
      if (!response.ok || !response.body) throw new Error(String(response.status));
      attempt = 0;
      handlers.onState?.("open");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          let event = "message", data = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (data) { try { handlers.onEvent(event, JSON.parse(data)); } catch { /* ignore malformed */ } }
        }
      }
    } catch { /* network drop: fall through to retry */ }
    if (closed) return;
    handlers.onState?.("retrying");
    const delay = Math.min(15_000, 600 * 2 ** attempt++) + Math.random() * 400;
    timer = setTimeout(connect, attempt === 1 ? 200 : delay);
  }

  void connect();
  return () => { closed = true; clearTimeout(timer); controller?.abort(); };
}
