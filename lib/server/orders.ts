import "server-only";
import { shortNumber } from "@/lib/domain/rules";
import type { Device, MenuItem, Order, OrderFlag, OrderItem, OrderStatus, Temperature } from "@/lib/domain/types";
import { iso, num, type Queryable } from "./db";

/** Explicit column list: tracking hashes never leave the database layer. */
export const ORDER_SELECT = `
  select o.id, o.public_number, o.device_id, o.device_sequence, o.event_day::text as event_day, o.first_name, o.total_cents,
    o.status, o.revision, o.flags, o.created_at_device, o.received_at_server, o.updated_at_server, o.making_at, o.ready_at,
    o.collected_at, o.cancelled_at, o.cancellation_reason,
    coalesce((select jsonb_agg(jsonb_build_object(
      'menuItemId', i.menu_item_id, 'menuRevision', i.menu_revision, 'nameSnapshot', i.name_snapshot,
      'unitPriceCentsSnapshot', i.unit_price_cents_snapshot, 'quantity', i.quantity, 'milk', i.milk, 'temperature', i.temperature
    ) order by i.line_no) from bb.order_items i where i.order_id = o.id), '[]'::jsonb) as items
  from bb.orders o`;

type R = Record<string, unknown>;

export function mapOrder(row: R): Order {
  const publicNo = String(row.public_number);
  return {
    id: String(row.id),
    publicNumber: publicNo,
    shortNumber: shortNumber(publicNo),
    deviceId: String(row.device_id),
    deviceSequence: num(row.device_sequence),
    eventDay: String(row.event_day),
    firstName: (row.first_name as string | null) ?? null,
    items: (row.items as OrderItem[]).map(item => ({ ...item, quantity: num(item.quantity), unitPriceCentsSnapshot: num(item.unitPriceCentsSnapshot), menuRevision: num(item.menuRevision) })),
    totalCents: num(row.total_cents),
    status: row.status as OrderStatus,
    revision: num(row.revision),
    flags: (row.flags as OrderFlag[]) ?? [],
    createdAtDevice: iso(row.created_at_device)!,
    receivedAtServer: iso(row.received_at_server),
    updatedAtServer: iso(row.updated_at_server),
    makingAt: iso(row.making_at),
    readyAt: iso(row.ready_at),
    collectedAt: iso(row.collected_at),
    cancelledAt: iso(row.cancelled_at),
    cancellationReason: (row.cancellation_reason as string | null) ?? null,
  };
}

export async function ordersForDay(db: Queryable, day: string): Promise<Order[]> {
  const rows = await db.query<R>(`${ORDER_SELECT} where o.event_day = $1::date order by o.server_seq limit 5000`, [day]);
  return rows.map(mapOrder);
}

export async function orderById(db: Queryable, id: string): Promise<Order | null> {
  const [row] = await db.query<R>(`${ORDER_SELECT} where o.id = $1`, [id]);
  return row ? mapOrder(row) : null;
}

export const MENU_COLUMNS = "id, name, description, category, price_cents, allowed_milk, allowed_temperatures, iced_surcharge_cents, milk_surcharges, sold_out, active, sort_order, revision, updated_at";
export const MENU_SELECT = `select ${MENU_COLUMNS} from bb.menu_items`;

export function mapMenu(row: R): MenuItem {
  return {
    id: String(row.id), name: String(row.name), description: String(row.description ?? ""), category: row.category as MenuItem["category"],
    priceCents: num(row.price_cents), allowedMilk: row.allowed_milk as string[], allowedTemperatures: row.allowed_temperatures as Temperature[],
    icedSurchargeCents: num(row.iced_surcharge_cents ?? 0),
    milkSurcharges: Object.fromEntries(Object.entries((row.milk_surcharges as Record<string, unknown>) ?? {}).map(([k, v]) => [k, num(v)])),
    soldOut: Boolean(row.sold_out), active: Boolean(row.active), sortOrder: num(row.sort_order), revision: num(row.revision), updatedAt: iso(row.updated_at)!,
  };
}

export async function menuItems(db: Queryable, includeInactive: boolean): Promise<MenuItem[]> {
  const rows = await db.query<R>(`${MENU_SELECT} ${includeInactive ? "" : "where active"} order by sort_order, name`);
  return rows.map(mapMenu);
}

export const DEVICE_SELECT = `select id, prefix, label, registered_at, last_seen_at, pending_ops, next_sequence, revoked_at, gap_expected from bb.devices`;

export function mapDevice(row: R): Device {
  return {
    id: String(row.id), prefix: String(row.prefix), label: String(row.label), registeredAt: iso(row.registered_at)!,
    lastSeenAt: iso(row.last_seen_at), pendingOps: row.pending_ops === null || row.pending_ops === undefined ? null : num(row.pending_ops),
    nextSequence: num(row.next_sequence), revokedAt: iso(row.revoked_at), gapExpected: row.gap_expected === null || row.gap_expected === undefined ? null : num(row.gap_expected),
  };
}

export async function devices(db: Queryable): Promise<Device[]> {
  return (await db.query<R>(`${DEVICE_SELECT} order by registered_at`)).map(mapDevice);
}
