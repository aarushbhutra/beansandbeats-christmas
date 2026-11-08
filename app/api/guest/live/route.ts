import { getDb } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { feedBus, sseStream } from "@/lib/server/live";
import { bearer, readGuestStatus } from "@/lib/server/public";

/** Streamed with fetch (not EventSource) so the token travels in a header, never in a URL. */
export const GET = route(async request => {
  const token = bearer(request);
  const db = await getDb();
  let last = "";
  return sseStream(request, send => {
    let busy = false;
    return feedBus.subscribe(async () => {
      if (busy) return;
      busy = true;
      try {
        const status = await readGuestStatus(db, token);
        const key = status ? `${status.status}|${status.ahead}|${status.etaMinutes}` : "missing";
        if (key !== last) { last = key; send("status", status); }
      } catch { /* retried on next change */ } finally { busy = false; }
    });
  });
});
