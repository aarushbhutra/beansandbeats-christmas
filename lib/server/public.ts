import "server-only";
import { eventDay, shortNumber, TRACKING_TOKEN } from "@/lib/domain/rules";
import type { BoardResponse, GuestStatus, OrderStatus } from "@/lib/domain/types";
import { iso, num, type Queryable } from "./db";
import { HttpError } from "./http";
import { sha256 } from "./passwords";

export function bearer(request: Request): string {
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) throw new HttpError(401, "TOKEN_REQUIRED", "Open your personal order link.");
  return token;
}

/** Ready board: first names only for ready orders, numbers only for drinks in progress. */
export async function readBoard(db: Queryable): Promise<BoardResponse> {
  const day = eventDay();
  const rows = await db.query<{ public_number: string; first_name: string | null; status: OrderStatus; ready_at: Date | null }>(
    `select public_number, first_name, status, ready_at from bb.orders
     where event_day = $1::date and status in ('queued', 'making', 'ready') order by server_seq limit 400`, [day]);
  return {
    day,
    serverTime: new Date().toISOString(),
    ready: rows.filter(r => r.status === "ready").sort((a, b) => (iso(a.ready_at) ?? "").localeCompare(iso(b.ready_at) ?? ""))
      .map(r => ({ publicNumber: r.public_number, shortNumber: shortNumber(r.public_number), firstName: r.first_name, readyAt: iso(r.ready_at) })),
    making: rows.filter(r => r.status === "making").map(r => ({ shortNumber: shortNumber(r.public_number), firstName: r.first_name })),
    queued: rows.filter(r => r.status === "queued").length,
  };
}

/** Guest lookup by token hash only. No names, totals, device or internal IDs leave the server. */
export async function readGuestStatus(db: Queryable, token: string): Promise<GuestStatus | null> {
  if (!TRACKING_TOKEN.test(token)) return null;
  const [row] = await db.query<Record<string, unknown>>(
    `select o.public_number, o.first_name, o.status, o.server_seq::text as server_seq, o.event_day::text as event_day, o.created_at_device, o.updated_at_server, o.ready_at,
       coalesce((select jsonb_agg(jsonb_build_object('nameSnapshot', i.name_snapshot, 'quantity', i.quantity, 'milk', i.milk, 'temperature', i.temperature) order by i.line_no)
         from bb.order_items i where i.order_id = o.id), '[]'::jsonb) as items
     from bb.orders o where o.tracking_token_hash = $1`, [sha256(token)]);
  if (!row) return null;
  const status = row.status as OrderStatus;
  let ahead = 0, etaMinutes: number | null = null;
  if (status === "queued" || status === "making") {
    const [queue] = await db.query<{ ahead: number }>(
      `select count(*)::int as ahead from bb.orders where event_day = $1::date and status in ('queued','making') and server_seq < $2::bigint`,
      [row.event_day, row.server_seq]);
    ahead = queue.ahead;
    const [pace] = await db.query<{ avg: number | null }>(
      `select avg(extract(epoch from (ready_at - received_at_server)))::float8 as avg from (
         select ready_at, received_at_server from bb.orders where event_day = $1::date and ready_at is not null order by ready_at desc limit 12) recent`,
      [row.event_day]);
    const perOrder = Math.min(900, Math.max(60, num(pace.avg ?? 210)));
    // Two baristas working in parallel; a deliberately rough estimate shown as "about".
    etaMinutes = Math.max(1, Math.round(((status === "making" ? 0.5 : ahead + 1) * perOrder) / 2 / 60));
  }
  return {
    publicNumber: String(row.public_number), shortNumber: shortNumber(String(row.public_number)), firstName: (row.first_name as string | null) ?? null, status,
    items: (row.items as GuestStatus["items"]).map(i => ({ ...i, quantity: num(i.quantity) })),
    ahead, etaMinutes, createdAt: iso(row.created_at_device)!, updatedAt: iso(row.updated_at_server), readyAt: iso(row.ready_at),
    serverTime: new Date().toISOString(),
  };
}
