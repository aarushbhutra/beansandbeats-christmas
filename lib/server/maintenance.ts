import "server-only";
import { eventDay } from "@/lib/domain/rules";
import type { Database } from "./db";
import { bumpFeed } from "./live";

export const NAME_RETENTION_MINUTES = Math.max(1, Number(process.env.NAME_RETENTION_MINUTES ?? 15));

const state = ((globalThis as { __bbMaintenance?: { last: number } }).__bbMaintenance ??= { last: 0 });

/**
 * Data minimisation: first names exist only to call out ready drinks. Purge them shortly after
 * collection/cancellation, and purge every name from previous SGT event days. Order rows and
 * sales snapshots are retained for reconciliation.
 */
export async function purgeNames(db: Database): Promise<{ purged: number }> {
  return db.tx(async q => {
    const rows = await q.query<{ id: string }>(
      `update bb.orders set first_name = null, name_purged_at = now()
       where first_name is not null and (
         (status in ('collected', 'cancelled') and coalesce(collected_at, cancelled_at, updated_at_server) < now() - make_interval(mins => $1::int))
         or event_day < $2::date)
       returning id`,
      [NAME_RETENTION_MINUTES, eventDay()]);
    await q.query("delete from bb.login_attempts where at < now() - interval '2 days'");
    await q.query("delete from bb.sessions where expires_at < now() - interval '7 days'");
    if (rows.length) await bumpFeed(q);
    return { purged: rows.length };
  });
}

/** Opportunistic purge, at most once a minute per server instance. */
export async function maybePurge(db: Database): Promise<void> {
  if (Date.now() - state.last < 60_000) return;
  state.last = Date.now();
  try { await purgeNames(db); } catch { state.last = 0; }
}
