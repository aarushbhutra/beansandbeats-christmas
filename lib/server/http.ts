import "server-only";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...(init.headers as Record<string, string> | undefined) } });
}

export function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, { status });
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Uniform error envelope. Unknown errors are logged without request bodies (which may hold names/tokens). */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertSameOrigin(request);
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.code, error.message);
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} failed:`, error instanceof Error ? error.message : "unknown error");
      return fail(500, "INTERNAL", "Something went wrong on our side. Saved tablet data is unaffected.");
    }
  };
}

/** CSRF guard for cookie-authenticated mutations: browsers always send Origin on POST/PATCH/DELETE. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { throw new HttpError(403, "BAD_ORIGIN", "Cross-site request blocked."); }
  if (!host || originHost !== host) throw new HttpError(403, "BAD_ORIGIN", "Cross-site request blocked.");
}

export async function readJson<T = unknown>(request: Request, maxBytes = 200_000): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "TOO_LARGE", "Request is too large.");
  try { return JSON.parse(text) as T; } catch { throw new HttpError(400, "INVALID_JSON", "Expected a JSON body."); }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > -1 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
