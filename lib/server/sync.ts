import "server-only";
import { z } from "zod";
import { cleanFirstName, eventDay, judgeTransition, orderTotal, parsePublicNumber, shiftDay, TRACKING_TOKEN, unitPriceCents } from "@/lib/domain/rules";
import type { Order, OrderFlag, OrderStatus, SyncOperation, SyncRequest, SyncResponse, SyncResult } from "@/lib/domain/types";
import type { Principal } from "./auth";
import { iso, num, type Database, type Queryable } from "./db";
import { HttpError } from "./http";
import { sha256 } from "./passwords";
import { bumpFeed, feedBus } from "./live";
import { maybePurge } from "./maintenance";
import { orderById } from "./orders";

const envelope = z.object({
  deviceId: z.uuid(),
  pending: z.number().int().min(0).max(100_000),
  appVersion: z.string().max(40).optional(),
  ops: z.array(z.object({ opId: z.uuid(), deviceId: z.uuid(), seq: z.number().int().positive(), entityId: z.uuid(), kind: z.string().max(30), createdAt: z.string().max(40), payload: z.unknown() })).max(50),
});

const item = z.object({
  menuItemId: z.uuid(), menuRevision: z.number().int().positive(), nameSnapshot: z.string().min(1).max(60),
  unitPriceCentsSnapshot: z.number().int().min(0).max(100_000), quantity: z.number().int().min(1).max(50),
  milk: z.string().min(1).max(40), temperature: z.enum(["hot", "iced"]),
});
const createPayload = z.object({
  trackingToken: z.string().regex(TRACKING_TOKEN),
  order: z.object({
    id: z.uuid(), publicNumber: z.string().max(20), eventDay: z.iso.date(), firstName: z.string().max(80),
    items: z.array(item).min(1).max(20), totalCents: z.number().int().min(0), createdAtDevice: z.iso.datetime(),
  }),
});
const advancePayload = z.object({ to: z.enum(["making", "ready", "collected"]) });
const cancelPayload = z.object({ reason: z.string().trim().min(1).max(200) });

type DeviceRow = { id: string; prefix: string; next_sequence: number; revoked_at: Date | null };
type Applied = { outcome: "acknowledged" | "conflict"; code?: string; message?: string; changed: boolean };

class OpConflict extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function applySync(db: Database, staff: Principal, body: unknown): Promise<SyncResponse> {
  const parsed = envelope.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_SYNC", "Sync request is malformed.");
  const request = parsed.data as SyncRequest;
  const ops = [...request.ops].sort((a, b) => a.seq - b.seq);
  if (ops.some(op => op.deviceId !== request.deviceId)) throw new HttpError(400, "INVALID_SYNC", "Every operation must come from the sending device.");

  const results: SyncResult[] = [];
  let changed = false;
  for (const op of ops) {
    const result = await db.tx(async q => {
      const [device] = await q.query<DeviceRow>("select id, prefix, next_sequence, revoked_at from bb.devices where id = $1 for update", [request.deviceId]);
      if (!device) throw new HttpError(404, "DEVICE_UNKNOWN", "This tablet isn't registered. Ask a booth lead to register it.");
      if (device.revoked_at) throw new HttpError(403, "DEVICE_REVOKED", "This tablet was retired by a booth lead. Its saved data stays on the tablet.");

      const [receipt] = await q.query<{ device_id: string; seq: number; outcome: string; code: string | null; message: string | null; entity_id: string }>(
        "select device_id, seq, outcome, code, message, entity_id from bb.sync_receipts where op_id = $1", [op.opId]);
      if (receipt) {
        if (receipt.device_id !== device.id || num(receipt.seq) !== op.seq) {
          return { opId: op.opId, seq: op.seq, outcome: "rejected", code: "OPERATION_ID_REUSED", message: "Operation ID already used by another change." } satisfies SyncResult;
        }
        // Lost acknowledgement: replay the original verdict, never apply twice.
        const order = await orderById(q, receipt.entity_id);
        return { opId: op.opId, seq: op.seq, outcome: receipt.outcome === "acknowledged" ? "duplicate" : "conflict", code: receipt.code ?? undefined, message: receipt.message ?? undefined, order: order ?? undefined } satisfies SyncResult;
      }
      const expected = num(device.next_sequence);
      if (op.seq < expected) return { opId: op.opId, seq: op.seq, outcome: "rejected", code: "SEQUENCE_REUSED", message: `Sequence ${op.seq} was already used on this tablet.` } satisfies SyncResult;
      if (op.seq > expected) {
        await q.query("update bb.devices set gap_expected = $2 where id = $1", [device.id, op.seq]);
        return { opId: op.opId, seq: op.seq, outcome: "gap", expectedSeq: expected, code: "SEQUENCE_GAP", message: `The server expected change #${expected} but received #${op.seq}. A booth lead can skip the missing changes from the tablets page.` } satisfies SyncResult;
      }

      let applied: Applied;
      try {
        applied = await applyOperation(q, staff, device, op as SyncOperation);
      } catch (error) {
        if (!(error instanceof OpConflict)) throw error;
        applied = { outcome: "conflict", code: error.code, message: error.message, changed: false };
      }
      // Conflicts consume the sequence too, so one bad change never blocks the tablet's later work.
      await q.query(
        "insert into bb.sync_receipts(op_id, device_id, seq, kind, entity_id, outcome, code, message, actor_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [op.opId, device.id, op.seq, op.kind, op.entityId, applied.outcome, applied.code ?? null, applied.message ?? null, staff.id]);
      await q.query("update bb.devices set next_sequence = $2, gap_expected = null, last_seen_at = now() where id = $1", [device.id, op.seq + 1]);
      if (applied.outcome === "conflict") {
        await q.query("insert into bb.sync_issues(op_id, device_id, entity_id, kind, code, message) values ($1,$2,$3,$4,$5,$6)",
          [op.opId, device.id, op.entityId, op.kind, applied.code, applied.message]);
      }
      if (applied.changed) await bumpFeed(q);
      const order = await orderById(q, op.entityId);
      return { opId: op.opId, seq: op.seq, outcome: applied.outcome, code: applied.code, message: applied.message, order: order ?? undefined } satisfies SyncResult;
    });
    results.push(result);
    if (result.outcome === "acknowledged") changed = true;
    if (result.outcome === "gap" || result.outcome === "rejected") break;
  }

  const consumed = results.filter(r => r.outcome !== "gap" && r.outcome !== "rejected").length;
  const [device] = await db.query<{ next_sequence: number }>(
    "update bb.devices set last_seen_at = now(), pending_ops = $2, app_version = coalesce($3, app_version) where id = $1 and revoked_at is null returning next_sequence",
    [request.deviceId, Math.max(0, request.pending - consumed), request.appVersion ?? null]);
  if (!device) throw new HttpError(404, "DEVICE_UNKNOWN", "This tablet isn't registered. Ask a booth lead to register it.");
  if (changed) feedBus.kick();
  void maybePurge(db);
  return { results, serverTime: new Date().toISOString(), nextSequence: num(device.next_sequence) };
}

async function applyOperation(q: Queryable, staff: Principal, device: DeviceRow, op: SyncOperation): Promise<Applied> {
  if (op.kind === "createOrder") return createOrder(q, staff, device, op);
  if (op.kind === "advanceOrder") {
    const payload = advancePayload.safeParse(op.payload);
    if (!payload.success) throw new OpConflict("INVALID_OPERATION", "Unknown target status.");
    return transition(q, staff, device, op, payload.data.to, null);
  }
  if (op.kind === "cancelOrder") {
    const payload = cancelPayload.safeParse(op.payload);
    if (!payload.success) throw new OpConflict("INVALID_OPERATION", "A cancellation reason is required.");
    return transition(q, staff, device, op, "cancelled", payload.data.reason);
  }
  throw new OpConflict("UNSUPPORTED", "This tablet sent an operation the server doesn't support. Update the app.");
}

async function createOrder(q: Queryable, staff: Principal, device: DeviceRow, op: Extract<SyncOperation, { kind: "createOrder" }>): Promise<Applied> {
  const parsed = createPayload.safeParse(op.payload);
  if (!parsed.success) throw new OpConflict("INVALID_ORDER", "The saved order is incomplete or malformed.");
  const { order, trackingToken } = parsed.data;
  if (order.id !== op.entityId) throw new OpConflict("INVALID_ORDER", "Order identity mismatch.");
  const firstName = cleanFirstName(order.firstName);
  if (!firstName) throw new OpConflict("INVALID_NAME", "First name must be 1–40 characters.");
  const today = eventDay();
  if (![shiftDay(today, -1), today, shiftDay(today, 1)].includes(order.eventDay)) throw new OpConflict("DAY_OUT_OF_RANGE", `Order day ${order.eventDay} is outside the current event window.`);
  const number = parsePublicNumber(order.publicNumber);
  if (!number || number.prefix !== device.prefix || number.mmdd !== order.eventDay.slice(5, 7) + order.eventDay.slice(8, 10)) throw new OpConflict("NUMBER_INVALID", "Order number doesn't match this tablet or day.");
  if (orderTotal(order.items) !== order.totalCents) throw new OpConflict("TOTAL_INVALID", "Order total doesn't match its drinks.");
  const [taken] = await q.query("select 1 from bb.orders where id = $1 or (event_day = $2::date and public_number = $3)", [order.id, order.eventDay, order.publicNumber]);
  if (taken) throw new OpConflict("NUMBER_TAKEN", `Order ${order.publicNumber} already exists on the server.`);

  const flags = new Set<OrderFlag>();
  for (const line of order.items) {
    type PriceRow = { name: string; price_cents: number; allowed_milk: string[]; allowed_temperatures: string[]; iced_surcharge_cents: number; milk_surcharges: Record<string, number> };
    const price = (row: PriceRow) => unitPriceCents({ priceCents: num(row.price_cents), icedSurchargeCents: num(row.iced_surcharge_cents), milkSurcharges: row.milk_surcharges ?? {} }, line.milk, line.temperature);
    const [revision] = await q.query<PriceRow>(
      "select name, price_cents, allowed_milk, allowed_temperatures, iced_surcharge_cents, milk_surcharges from bb.menu_revisions where menu_item_id = $1 and revision = $2", [line.menuItemId, line.menuRevision]);
    if (!revision || revision.name !== line.nameSnapshot || price(revision) !== line.unitPriceCentsSnapshot || !revision.allowed_milk.includes(line.milk) || !revision.allowed_temperatures.includes(line.temperature)) {
      throw new OpConflict("MENU_MISMATCH", `"${line.nameSnapshot}" doesn't match any menu version on the server.`);
    }
    const [current] = await q.query<PriceRow & { revision: number; sold_out: boolean; active: boolean }>(
      "select revision, sold_out, active, name, price_cents, allowed_milk, allowed_temperatures, iced_surcharge_cents, milk_surcharges from bb.menu_items where id = $1", [line.menuItemId]);
    // The sale already happened at the POS: accept it at its snapshot price, but flag drift for the lead.
    if (num(current.revision) !== line.menuRevision && (price(current) !== line.unitPriceCentsSnapshot || current.name !== line.nameSnapshot)) flags.add("stale_menu");
    if (current.sold_out || !current.active) flags.add("sold_out_at_sync");
  }

  await q.query(
    `insert into bb.orders(id, public_number, device_id, device_sequence, event_day, first_name, tracking_token_hash, total_cents, flags, created_at_device, created_by)
     values ($1, $2, $3, $4, $5::date, $6, $7, $8, array(select jsonb_array_elements_text($9::text::jsonb)), $10::timestamptz, $11)`,
    [order.id, order.publicNumber, device.id, op.seq, order.eventDay, firstName, sha256(trackingToken), order.totalCents, JSON.stringify([...flags]), order.createdAtDevice, staff.id]);
  for (const [index, line] of order.items.entries()) {
    await q.query(
      `insert into bb.order_items(order_id, line_no, menu_item_id, menu_revision, name_snapshot, unit_price_cents_snapshot, quantity, milk, temperature)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [order.id, index + 1, line.menuItemId, line.menuRevision, line.nameSnapshot, line.unitPriceCentsSnapshot, line.quantity, line.milk, line.temperature]);
  }
  await q.query("insert into bb.order_events(order_id, kind, to_status, actor_id, device_id, op_id, at_device, detail) values ($1,'created','queued',$2,$3,$4,$5::timestamptz,$6)",
    [order.id, staff.id, device.id, op.opId, order.createdAtDevice, flags.size ? [...flags].join(",") : null]);
  return { outcome: "acknowledged", changed: true };
}

async function transition(q: Queryable, staff: Principal, device: DeviceRow, op: SyncOperation, target: OrderStatus, reason: string | null): Promise<Applied> {
  const [row] = await q.query<{ status: OrderStatus }>("select status from bb.orders where id = $1 for update", [op.entityId]);
  if (!row) throw new OpConflict("ORDER_NOT_FOUND", "That order never reached the server, so this change couldn't apply.");
  const verdict = judgeTransition(row.status, target);
  if (verdict === "conflict") {
    throw new OpConflict(row.status === "cancelled" ? "ORDER_CANCELLED" : "ORDER_CLOSED",
      row.status === "cancelled" ? "Another tablet already cancelled this order." : "This order was already collected, so it can't be cancelled.");
  }
  if (verdict === "noop") return { outcome: "acknowledged", code: "ALREADY_DONE", message: "Another tablet already moved this order on.", changed: false };
  const column = target === "making" ? "making_at" : target === "ready" ? "ready_at" : target === "collected" ? "collected_at" : "cancelled_at";
  await q.query(
    `update bb.orders set status = $2, revision = revision + 1, updated_at_server = now(), ${column} = coalesce(${column}, now()),
       cancellation_reason = case when $2 = 'cancelled' then $3 else cancellation_reason end
     where id = $1`,
    [op.entityId, target, reason]);
  await q.query("insert into bb.order_events(order_id, kind, from_status, to_status, actor_id, device_id, op_id, at_device, detail) values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9)",
    [op.entityId, target === "cancelled" ? "cancelled" : "advanced", row.status, target, staff.id, device.id, op.opId, iso(op.createdAt), reason]);
  return { outcome: "acknowledged", changed: true };
}

export type { Order };
