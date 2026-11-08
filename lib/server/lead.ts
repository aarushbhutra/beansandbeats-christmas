import "server-only";
import { z } from "zod";
import { calculateDailyReport } from "@/lib/domain/report";
import { prefixForIndex } from "@/lib/domain/rules";
import type { DailyReport, Device, MenuItem, StaffProfile } from "@/lib/domain/types";
import { audit, type Principal } from "./auth";
import { iso, num, type Database, type Queryable } from "./db";
import { HttpError } from "./http";
import { bumpFeed, feedBus } from "./live";
import { devices as listDevices, mapDevice, mapMenu, MENU_COLUMNS, MENU_SELECT, DEVICE_SELECT, ordersForDay } from "./orders";
import { hashPassword } from "./passwords";

/* ---------- Menu ---------- */

const optionList = z.array(z.string().trim().toLowerCase().min(1).max(30)).min(1).max(12)
  .refine(values => new Set(values).size === values.length, "Options must be unique");
export const menuInput = z.object({
  name: z.string().trim().toLowerCase().min(1).max(60),
  description: z.string().trim().max(140).default(""),
  category: z.enum(["coffee", "seasonal", "not-coffee"]),
  priceCents: z.number().int().min(0).max(100_000),
  allowedMilk: optionList,
  allowedTemperatures: z.array(z.enum(["hot", "iced"])).min(1).max(2).refine(values => new Set(values).size === values.length),
  icedSurchargeCents: z.number().int().min(0).max(10_000).default(0),
  milkSurcharges: z.record(z.string(), z.number().int().min(0).max(10_000)).default({}),
  soldOut: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
}).strict();

function parseMenu(body: unknown) {
  const parsed = menuInput.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_MENU", parsed.error.issues[0]?.message ?? "Check the menu fields.");
  const data = parsed.data;
  // Only keep surcharges for milks the drink actually offers; drop zero entries.
  data.milkSurcharges = Object.fromEntries(Object.entries(data.milkSurcharges).map(([k, v]) => [k.trim().toLowerCase(), v]).filter(([k, v]) => data.allowedMilk.includes(k as string) && (v as number) > 0));
  return data;
}

async function snapshotRevision(q: Queryable, id: string, actor: string) {
  await q.query(
    `insert into bb.menu_revisions(menu_item_id, revision, name, price_cents, allowed_milk, allowed_temperatures, iced_surcharge_cents, milk_surcharges, sold_out, active, changed_by)
     select id, revision, name, price_cents, allowed_milk, allowed_temperatures, iced_surcharge_cents, milk_surcharges, sold_out, active, $2 from bb.menu_items where id = $1`, [id, actor]);
}

export async function createMenuItem(db: Database, staff: Principal, body: unknown): Promise<MenuItem> {
  const input = parseMenu(body);
  const item = await db.tx(async q => {
    const [row] = await q.query<Record<string, unknown>>(
      `insert into bb.menu_items(name, description, category, price_cents, allowed_milk, allowed_temperatures, sold_out, active, sort_order, updated_by, iced_surcharge_cents, milk_surcharges)
       values ($1,$2,$3,$4,array(select jsonb_array_elements_text($5::text::jsonb)),array(select jsonb_array_elements_text($6::text::jsonb)),$7,$8,$9,$10,$11,$12::text::jsonb)
       returning ${MENU_COLUMNS}`,
      [input.name, input.description, input.category, input.priceCents, JSON.stringify(input.allowedMilk), JSON.stringify(input.allowedTemperatures), input.soldOut, input.active, input.sortOrder, staff.id, input.icedSurchargeCents, JSON.stringify(input.milkSurcharges)]);
    await snapshotRevision(q, String(row.id), staff.id);
    await audit(q, staff.id, "menu.create", String(row.id), input);
    await bumpFeed(q);
    return mapMenu(row);
  });
  feedBus.kick();
  return item;
}

export async function updateMenuItem(db: Database, staff: Principal, id: string, body: unknown): Promise<MenuItem> {
  const envelope = z.object({ expectedRevision: z.number().int().positive(), change: z.unknown() }).safeParse(body);
  if (!envelope.success) throw new HttpError(400, "INVALID_MENU", "Include expectedRevision and change.");
  const input = parseMenu(envelope.data.change);
  const item = await db.tx(async q => {
    const [row] = await q.query<Record<string, unknown>>(
      `update bb.menu_items set name=$3, description=$4, category=$5, price_cents=$6,
         allowed_milk=array(select jsonb_array_elements_text($7::text::jsonb)), allowed_temperatures=array(select jsonb_array_elements_text($8::text::jsonb)),
         sold_out=$9, active=$10, sort_order=$11, revision=revision+1, updated_at=now(), updated_by=$12,
         iced_surcharge_cents=$13, milk_surcharges=$14::text::jsonb
       where id=$1 and revision=$2
       returning ${MENU_COLUMNS}`,
      [id, envelope.data.expectedRevision, input.name, input.description, input.category, input.priceCents, JSON.stringify(input.allowedMilk), JSON.stringify(input.allowedTemperatures), input.soldOut, input.active, input.sortOrder, staff.id, input.icedSurchargeCents, JSON.stringify(input.milkSurcharges)]);
    if (!row) {
      const [exists] = await q.query("select 1 from bb.menu_items where id = $1", [id]);
      throw exists ? new HttpError(409, "REVISION_CONFLICT", "Someone else changed this item. Reload it and try again.") : new HttpError(404, "NOT_FOUND", "Menu item not found.");
    }
    await snapshotRevision(q, id, staff.id);
    await audit(q, staff.id, "menu.update", id, input);
    await bumpFeed(q);
    return mapMenu(row);
  });
  feedBus.kick();
  return item;
}

export async function allMenu(db: Queryable): Promise<MenuItem[]> {
  return (await db.query<Record<string, unknown>>(`${MENU_SELECT} order by sort_order, name`)).map(mapMenu);
}

/* ---------- Devices ---------- */

export async function registerDevice(db: Database, staff: Principal, body: unknown): Promise<Device> {
  const parsed = z.object({ label: z.string().trim().toLowerCase().min(1).max(40) }).safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_DEVICE", "Give the tablet a short label, like “counter ipad”.");
  return db.tx(async q => {
    await q.query("select pg_advisory_xact_lock(724114)");
    const used = new Set((await q.query<{ prefix: string }>("select prefix from bb.devices")).map(r => r.prefix));
    let index = 0;
    while (used.has(prefixForIndex(index))) index++;
    if (index >= 26 * 27) throw new HttpError(409, "NO_PREFIX", "No device prefixes left.");
    const [row] = await q.query<Record<string, unknown>>(
      `insert into bb.devices(prefix, label, registered_by, last_seen_at, pending_ops) values ($1,$2,$3,now(),0)
       returning id, prefix, label, registered_at, last_seen_at, pending_ops, next_sequence, revoked_at, gap_expected`,
      [prefixForIndex(index), parsed.data.label, staff.id]);
    await audit(q, staff.id, "device.register", String(row.id), { prefix: row.prefix, label: row.label });
    return mapDevice(row);
  });
}

export async function deviceAction(db: Database, staff: Principal, id: string, body: unknown): Promise<Device> {
  const parsed = z.object({ action: z.enum(["revoke", "skip-gap", "rename"]), label: z.string().trim().toLowerCase().min(1).max(40).optional() }).safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_ACTION", "Unknown device action.");
  return db.tx(async q => {
    const [device] = await q.query<Record<string, unknown>>(`${DEVICE_SELECT} where id = $1 for update`, [id]);
    if (!device) throw new HttpError(404, "NOT_FOUND", "Tablet not found.");
    const { action, label } = parsed.data;
    if (action === "revoke") await q.query("update bb.devices set revoked_at = coalesce(revoked_at, now()) where id = $1", [id]);
    if (action === "rename") {
      if (!label) throw new HttpError(400, "INVALID_ACTION", "Label required.");
      await q.query("update bb.devices set label = $2 where id = $1", [id, label]);
    }
    if (action === "skip-gap") {
      if (device.gap_expected === null) throw new HttpError(409, "NO_GAP", "This tablet has no sequence gap.");
      await q.query("update bb.devices set next_sequence = gap_expected, gap_expected = null where id = $1", [id]);
    }
    await audit(q, staff.id, `device.${action}`, id, { label });
    const [updated] = await q.query<Record<string, unknown>>(`${DEVICE_SELECT} where id = $1`, [id]);
    return mapDevice(updated);
  });
}

export async function deviceOverview(db: Queryable) {
  const list = await listDevices(db);
  const stats = await db.query<{ device_id: string; orders: number; last_order_at: Date | null }>(
    "select device_id, count(*)::int as orders, max(received_at_server) as last_order_at from bb.orders group by device_id");
  const issues = await db.query<Record<string, unknown>>(
    `select i.id, i.op_id, i.device_id, i.entity_id, i.kind, i.code, i.message, i.created_at, d.prefix, o.public_number
     from bb.sync_issues i join bb.devices d on d.id = i.device_id left join bb.orders o on o.id = i.entity_id
     where i.resolved_at is null order by i.created_at desc limit 100`);
  return {
    devices: list.map(device => {
      const stat = stats.find(s => s.device_id === device.id);
      return { ...device, orders: stat?.orders ?? 0, lastOrderAt: iso(stat?.last_order_at) };
    }),
    issues: issues.map(row => ({
      id: String(row.id), opId: String(row.op_id), deviceId: String(row.device_id), prefix: String(row.prefix), entityId: row.entity_id ? String(row.entity_id) : null,
      publicNumber: (row.public_number as string | null) ?? null, kind: String(row.kind), code: String(row.code), message: String(row.message), createdAt: iso(row.created_at)!,
    })),
  };
}

export async function resolveIssue(db: Database, staff: Principal, id: string): Promise<void> {
  const rows = await db.query("update bb.sync_issues set resolved_at = now(), resolved_by = $2 where id = $1 and resolved_at is null returning id", [id, staff.id]);
  if (!rows.length) throw new HttpError(404, "NOT_FOUND", "Issue already resolved.");
  await audit(db, staff.id, "sync.resolve", id);
}

/* ---------- Staff ---------- */

const staffInput = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,32}$/, "Usernames use 2–32 lowercase letters, numbers, dots, dashes or underscores."),
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(["barista", "lead"]),
  password: z.string().trim().min(10, "Passwords need at least 10 characters.").max(200),
});

export async function listStaff(db: Queryable): Promise<(StaffProfile & { active: boolean; createdAt: string; lastSeenAt: string | null })[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select s.id, s.username, s.display_name, s.role, s.active, s.created_at, (select max(last_seen_at) from bb.sessions where staff_id = s.id) as last_seen_at
     from bb.staff s order by s.role desc, s.username`);
  return rows.map(r => ({ id: String(r.id), username: String(r.username), displayName: String(r.display_name), role: r.role as StaffProfile["role"], active: Boolean(r.active), createdAt: iso(r.created_at)!, lastSeenAt: iso(r.last_seen_at) }));
}

export async function createStaff(db: Database, staff: Principal, body: unknown) {
  const parsed = staffInput.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_STAFF", parsed.error.issues[0]?.message ?? "Check the account fields.");
  const input = parsed.data;
  const [row] = await db.query<{ id: string }>(
    "insert into bb.staff(username, display_name, role, password_hash) values ($1,$2,$3,$4) on conflict (username) do nothing returning id",
    [input.username, input.displayName, input.role, await hashPassword(input.password)]);
  if (!row) throw new HttpError(409, "USERNAME_TAKEN", "That username is already in use.");
  await audit(db, staff.id, "staff.create", row.id, { username: input.username, role: input.role });
  return row;
}

export async function updateStaff(db: Database, staff: Principal, id: string, body: unknown) {
  const parsed = z.object({
    active: z.boolean().optional(), role: z.enum(["barista", "lead"]).optional(),
    password: z.string().trim().min(10, "Passwords need at least 10 characters.").max(200).optional(), displayName: z.string().trim().min(1).max(60).optional(),
  }).strict().safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_STAFF", parsed.error.issues[0]?.message ?? "Check the account fields.");
  const change = parsed.data;
  if (id === staff.id && (change.active === false || change.role === "barista")) throw new HttpError(409, "SELF_LOCKOUT", "You can't demote or deactivate your own account.");
  await db.tx(async q => {
    const [row] = await q.query("select 1 from bb.staff where id = $1 for update", [id]);
    if (!row) throw new HttpError(404, "NOT_FOUND", "Account not found.");
    if (change.active !== undefined) await q.query("update bb.staff set active = $2, updated_at = now() where id = $1", [id, change.active]);
    if (change.role) await q.query("update bb.staff set role = $2, updated_at = now() where id = $1", [id, change.role]);
    if (change.displayName) await q.query("update bb.staff set display_name = $2, updated_at = now() where id = $1", [id, change.displayName]);
    if (change.password) await q.query("update bb.staff set password_hash = $2, updated_at = now() where id = $1", [id, await hashPassword(change.password)]);
    // Any security-relevant change signs the account out everywhere.
    if (change.active === false || change.password || change.role) await q.query("update bb.sessions set revoked_at = now() where staff_id = $1 and revoked_at is null", [id]);
    const [{ leads }] = await q.query<{ leads: number }>("select count(*)::int as leads from bb.staff where role = 'lead' and active");
    if (leads < 1) throw new HttpError(409, "LAST_LEAD", "Keep at least one active booth lead.");
    await audit(q, staff.id, "staff.update", id, { ...change, password: change.password ? "changed" : undefined });
  });
}

/* ---------- Reports & day close ---------- */

export async function dailyReport(db: Queryable, day: string): Promise<DailyReport> {
  const [orders, deviceList, closures] = [await ordersForDay(db, day), await listDevices(db), await db.query<{ closed_at: Date; display_name: string }>(
    "select c.closed_at, s.display_name from bb.day_closures c join bb.staff s on s.id = c.closed_by where c.event_day = $1::date", [day])];
  const closure = closures[0] ? { closedAt: iso(closures[0].closed_at)!, closedBy: closures[0].display_name } : null;
  // Tablets registered after the day ended are irrelevant to that day's reconciliation.
  const relevant = deviceList.filter(device => Date.parse(device.registeredAt) < Date.parse(`${day}T16:00:00Z`));
  return calculateDailyReport({ day, orders, devices: relevant, closure });
}

export async function closeDay(db: Database, staff: Principal, day: string, body: unknown): Promise<DailyReport> {
  const parsed = z.object({ note: z.string().trim().max(500).default(""), acknowledgeWarnings: z.boolean().default(false) }).safeParse(body ?? {});
  if (!parsed.success) throw new HttpError(400, "INVALID_CLOSE", "Invalid close-out request.");
  const report = await dailyReport(db, day);
  if (!report.reconciliation.complete && !parsed.data.acknowledgeWarnings) throw new HttpError(409, "NOT_RECONCILED", "Reconciliation isn't complete. Review the warnings or acknowledge them to close anyway.");
  const summary = { orders: report.orders, cups: report.cups, totalCents: report.totalCents, cancelledOrders: report.cancelledOrders, warnings: report.reconciliation.warnings };
  await db.query(
    `insert into bb.day_closures(event_day, closed_by, summary, note) values ($1::date, $2, $3::text::jsonb, $4)
     on conflict (event_day) do update set closed_by = excluded.closed_by, closed_at = now(), summary = excluded.summary, note = excluded.note`,
    [day, staff.id, JSON.stringify(summary), parsed.data.note || null]);
  await audit(db, staff.id, "day.close", day, summary);
  return dailyReport(db, day);
}

export async function liveStats(db: Queryable, day: string) {
  const [row] = await db.query<Record<string, unknown>>(
    `select count(*) filter (where status <> 'cancelled')::int as orders,
       coalesce(sum(total_cents) filter (where status <> 'cancelled'), 0)::int as total_cents,
       count(*) filter (where status = 'queued')::int as queued, count(*) filter (where status = 'making')::int as making,
       count(*) filter (where status = 'ready')::int as ready, count(*) filter (where status = 'collected')::int as collected,
       count(*) filter (where status = 'cancelled')::int as cancelled,
       coalesce((select sum(i.quantity) from bb.order_items i join bb.orders o2 on o2.id = i.order_id where o2.event_day = $1::date and o2.status <> 'cancelled'), 0)::int as cups,
       count(*) filter (where received_at_server > now() - interval '15 minutes' and status <> 'cancelled')::int as last15
     from bb.orders where event_day = $1::date`, [day]);
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, num(value)])) as Record<string, number>;
}

/* ---------- Reset after test runs ---------- */

/**
 * Wipes operational data (orders, tablets, sync history, closures, other sessions) but keeps staff
 * accounts and the menu. For clearing dry-run data before the event. Lock it for the live event
 * with DISABLE_DATA_RESET=true.
 */
export async function resetOperationalData(db: Database, staff: Principal, body: unknown): Promise<{ orders: number; devices: number }> {
  if (process.env.DISABLE_DATA_RESET === "true") throw new HttpError(403, "RESET_DISABLED", "Data reset is locked for the live event.");
  const parsed = z.object({ confirm: z.literal("reset") }).safeParse(body);
  if (!parsed.success) throw new HttpError(400, "CONFIRM_REQUIRED", "Type “reset” to confirm.");
  const result = await db.tx(async q => {
    const [{ orders }] = await q.query<{ orders: number }>("select count(*)::int as orders from bb.orders");
    const [{ devices }] = await q.query<{ devices: number }>("select count(*)::int as devices from bb.devices");
    await q.query("alter table bb.order_items disable trigger order_items_immutable");
    await q.query("delete from bb.order_items");
    await q.query("alter table bb.order_items enable trigger order_items_immutable");
    for (const table of ["order_events", "sync_issues", "sync_receipts", "day_closures", "orders", "devices", "login_attempts"]) await q.query(`delete from bb.${table}`);
    await q.query("delete from bb.sessions where id <> $1", [staff.sessionId]);
    await audit(q, staff.id, "data.reset", null, { orders, devices });
    await bumpFeed(q);
    return { orders, devices };
  });
  feedBus.kick();
  return result;
}
