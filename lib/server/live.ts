import "server-only";
import { getDb, type Queryable } from "./db";

type Listener = (seq: number) => void;

/**
 * One change detector per server instance, shared by every open stream on it.
 * Writers bump bb.feed_state inside their transaction, so a seq is only visible after commit.
 * Instances poll that single row once a second; the writing instance is kicked immediately.
 */
class FeedBus {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private polling = false;
  last = -1;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (!this.timer) {
      this.timer = setInterval(() => void this.poll(), 1000);
      void this.poll();
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.timer) { clearInterval(this.timer); this.timer = undefined; }
    };
  }

  kick(): void { if (this.listeners.size) void this.poll(); }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const db = await getDb();
      const [row] = await db.query<{ seq: number }>("select seq::int as seq from bb.feed_state where id = 1");
      if (row && row.seq !== this.last) {
        this.last = row.seq;
        for (const listener of this.listeners) listener(row.seq);
      }
    } catch {
      // Transient database errors: streams keep their last state; clients also poll.
    } finally {
      this.polling = false;
    }
  }
}

export const feedBus: FeedBus = ((globalThis as { __bbFeedBus?: FeedBus }).__bbFeedBus ??= new FeedBus());

export async function bumpFeed(q: Queryable): Promise<number> {
  const [row] = await q.query<{ seq: number }>("update bb.feed_state set seq = seq + 1, changed_at = now() where id = 1 returning seq::int as seq");
  return row.seq;
}

export async function currentFeedSeq(q: Queryable): Promise<number> {
  const [row] = await q.query<{ seq: number }>("select seq::int as seq from bb.feed_state where id = 1");
  return row?.seq ?? 0;
}

/**
 * Server-Sent Events over a plain streaming Response. Streams end after ~50s so serverless
 * functions recycle cleanly; clients reconnect with backoff and also refetch on reconnect.
 */
export function sseStream(request: Request, start: (send: (event: string, data: unknown) => void) => (() => void) | void, maxMs = 50_000): Response {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | void;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => { if (!closed) try { controller.enqueue(encoder.encode(chunk)); } catch { finish(); } };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
      const lifetime = setTimeout(() => finish(), maxMs);
      function finish() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat); clearTimeout(lifetime);
        try { cleanup?.(); } catch { /* ignore */ }
        try { controller.close(); } catch { /* already closed */ }
      }
      request.signal.addEventListener("abort", finish);
      write("retry: 2500\n\n");
      cleanup = start(send);
    },
    cancel() { closed = true; try { cleanup?.(); } catch { /* ignore */ } },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
