import { getDb } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { feedBus, sseStream } from "@/lib/server/live";
import { readBoard } from "@/lib/server/public";

export const GET = route(async request => {
  const db = await getDb();
  return sseStream(request, send => {
    let busy = false;
    return feedBus.subscribe(async () => {
      if (busy) return;
      busy = true;
      try { send("board", await readBoard(db)); } catch { /* next change retries */ } finally { busy = false; }
    });
  });
});
