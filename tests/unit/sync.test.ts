import assert from "node:assert/strict";
import { test } from "node:test";
import { applySync } from "@/lib/server/sync";
import { dailyReport, deviceAction, updateMenuItem } from "@/lib/server/lead";
import { ordersForDay } from "@/lib/server/orders";
import { readBoard, readGuestStatus } from "@/lib/server/public";
import { purgeNames } from "@/lib/server/maintenance";
import { login, principalFromRequest } from "@/lib/server/auth";
import { eventDay } from "@/lib/domain/rules";
import { setup, Tablet } from "./helpers";

test("an order travels queued → making → ready → collected with guest + board views", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  const { op, id, token } = tablet.create(menu[0], { name: "Priya", quantity: 2 });
  const first = await applySync(db, barista, tablet.batch([op]));
  assert.equal(first.results[0].outcome, "acknowledged");
  assert.equal(first.results[0].order?.status, "queued");
  assert.equal(first.results[0].order?.totalCents, menu[0].priceCents * 2);

  const guest = await readGuestStatus(db, token);
  assert.equal(guest?.status, "queued");
  assert.equal(guest?.ahead, 0);
  assert.ok(guest?.etaMinutes && guest.etaMinutes >= 1);
  assert.equal(guest?.firstName, "Priya", "guests see only their own first name");
  assert.equal((guest as unknown as Record<string, unknown>).totalCents, undefined, "no totals or internal ids in the guest view");

  await applySync(db, barista, tablet.batch([tablet.advance(id, "making"), tablet.advance(id, "ready")]));
  const board = await readBoard(db);
  assert.deepEqual(board.ready.map(r => [r.shortNumber, r.firstName]), [["A-001", "Priya"]]);
  assert.equal((await readGuestStatus(db, token))?.status, "ready");

  await applySync(db, barista, tablet.batch([tablet.advance(id, "collected")]));
  assert.equal((await readBoard(db)).ready.length, 0);
  const [order] = await ordersForDay(db, eventDay());
  assert.equal(order.status, "collected");
  assert.ok(order.makingAt && order.readyAt && order.collectedAt);
  assert.equal(order.revision, 4);
});

test("a lost acknowledgement is replayed, never applied twice", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  const { op } = tablet.create(menu[1]);
  await applySync(db, barista, tablet.batch([op]));
  const replay = await applySync(db, barista, tablet.batch([op]));
  assert.equal(replay.results[0].outcome, "duplicate");
  assert.equal((await ordersForDay(db, eventDay())).length, 1);
  const [{ count }] = await db.query<{ count: number }>("select count(*)::int as count from bb.order_items");
  assert.equal(count, 1);
});

test("conflicts consume the sequence so later work still syncs", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  const bad = tablet.create(menu[0], { price: 1 }); // tampered price: matches no menu version
  const good = tablet.create(menu[0]);
  const response = await applySync(db, barista, tablet.batch([bad.op, good.op]));
  assert.deepEqual(response.results.map(r => r.outcome), ["conflict", "acknowledged"]);
  assert.equal(response.results[0].code, "MENU_MISMATCH");
  const [issue] = await db.query<{ code: string }>("select code from bb.sync_issues");
  assert.equal(issue.code, "MENU_MISMATCH");
  assert.equal(response.nextSequence, 3);
});

test("two tablets racing the same order never regress its status", async () => {
  const { db, lead, barista, menu } = await setup();
  const counter = await Tablet.register(db, lead, "counter");
  const bar = await Tablet.register(db, lead, "bar");
  assert.equal(bar.device.prefix, "B");
  const { op, id } = counter.create(menu[0]);
  await applySync(db, barista, counter.batch([op]));
  await applySync(db, barista, bar.batch([bar.advance(id, "making"), bar.advance(id, "ready")]));
  // The counter tablet was offline and still thinks the order is queued.
  const stale = await applySync(db, barista, counter.batch([counter.advance(id, "making")]));
  assert.equal(stale.results[0].outcome, "acknowledged");
  assert.equal(stale.results[0].code, "ALREADY_DONE");
  assert.equal(stale.results[0].order?.status, "ready");
  // Cancelling something already collected is a visible conflict.
  await applySync(db, barista, bar.batch([bar.advance(id, "collected")]));
  const late = await applySync(db, barista, counter.batch([counter.cancel(id)]));
  assert.equal(late.results[0].outcome, "conflict");
  assert.equal(late.results[0].code, "ORDER_CLOSED");
});

test("offline sales against an old menu are accepted at their snapshot price and flagged", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  const item = menu[0];
  const offline = tablet.create(item); // captured at revision 1 while offline
  await updateMenuItem(db, lead, item.id, { expectedRevision: item.revision, change: { name: item.name, description: item.description, category: item.category, priceCents: item.priceCents + 100, allowedMilk: item.allowedMilk, allowedTemperatures: item.allowedTemperatures, soldOut: true, active: true, sortOrder: item.sortOrder } });
  const result = await applySync(db, barista, tablet.batch([offline.op]));
  assert.equal(result.results[0].outcome, "acknowledged");
  assert.deepEqual(result.results[0].order?.flags.sort(), ["sold_out_at_sync", "stale_menu"]);
  assert.equal(result.results[0].order?.totalCents, item.priceCents, "old order keeps its original price");
  const report = await dailyReport(db, eventDay());
  assert.equal(report.flaggedOrders, 1);
  const { id: _id, revision: _revision, updatedAt: _updatedAt, ...change } = item;
  await assert.rejects(updateMenuItem(db, lead, item.id, { expectedRevision: item.revision, change }), /changed this item/);
});

test("sequence gaps pause the tablet until a lead skips them", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  tablet.create(menu[0]); // seq 1 lost locally (never sent)
  const second = tablet.create(menu[0]);
  const gap = await applySync(db, barista, tablet.batch([second.op]));
  assert.equal(gap.results[0].outcome, "gap");
  assert.equal(gap.results[0].expectedSeq, 1);
  await deviceAction(db, lead, tablet.device.id, { action: "skip-gap" });
  const retry = await applySync(db, barista, tablet.batch([second.op]));
  assert.equal(retry.results[0].outcome, "acknowledged");
});

test("revoked tablets cannot sync", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  await deviceAction(db, lead, tablet.device.id, { action: "revoke" });
  await assert.rejects(applySync(db, barista, tablet.batch([tablet.create(menu[0]).op])), /retired/);
});

test("reports count cups and value, exclude cancellations and track reconciliation", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  const a = tablet.create(menu[0], { quantity: 2 });
  const b = tablet.create(menu[1], { quantity: 1 });
  await applySync(db, barista, tablet.batch([a.op, b.op, tablet.cancel(b.id), tablet.advance(a.id, "ready"), tablet.advance(a.id, "collected")], 5));
  const report = await dailyReport(db, eventDay());
  assert.equal(report.cups, 2);
  assert.equal(report.totalCents, menu[0].priceCents * 2);
  assert.equal(report.cancelledOrders, 1);
  assert.equal(report.cancelledTotalCents, menu[1].priceCents);
  assert.equal(report.rows.length, 2);
  assert.equal(report.reconciliation.complete, true, report.reconciliation.warnings.join("; "));
  await applySync(db, barista, { deviceId: tablet.device.id, pending: 3, ops: [] });
  const pending = await dailyReport(db, eventDay());
  assert.equal(pending.reconciliation.complete, false);
  assert.match(pending.reconciliation.warnings.join(" "), /3 unsynced changes/);
});

test("names are purged after collection and from previous days", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  const { op, id } = tablet.create(menu[0], { name: "Mei" });
  await applySync(db, barista, tablet.batch([op, tablet.advance(id, "collected")]));
  await db.query("update bb.orders set collected_at = now() - interval '2 hours'");
  assert.equal((await purgeNames(db)).purged, 1);
  const [order] = await ordersForDay(db, eventDay());
  assert.equal(order.firstName, null);
});

test("login issues a session, rejects bad passwords and rate limits", async () => {
  const { db } = await setup();
  const ip = "203.0.113.9";
  const session = await login(db, { username: "LEAD", password: "correct horse battery", ip });
  assert.equal(session.staff.role, "lead");
  const principal = await principalFromRequest(db, new Request("http://x/", { headers: { cookie: `bb_session=${session.token}` } }));
  assert.equal(principal?.username, "lead");
  for (let i = 0; i < 8; i++) await assert.rejects(login(db, { username: "barista", password: "wrong", ip: "198.51.100.1" }), /match/);
  await assert.rejects(login(db, { username: "barista", password: "correct horse battery", ip: "198.51.100.1" }), /Too many/);
});

test("modifier prices: iced +$1 and oat +$1 are part of the verified unit price", async () => {
  const { db, lead, barista, menu } = await setup();
  const tablet = await Tablet.register(db, lead);
  const latte = menu.find(m => m.name === "latte")!;
  assert.equal(latte.icedSurchargeCents, 100);
  assert.deepEqual(latte.milkSurcharges, { oat: 100 });
  const make = (price: number) => {
    const draft = tablet.create(latte, { milk: "oat", price });
    const payload = draft.op.payload as { order: { items: { temperature: string }[] } };
    payload.order.items[0].temperature = "iced";
    return draft;
  };
  const good = make(1000);
  const bad = make(800); // forgot the surcharges
  const result = await applySync(db, barista, tablet.batch([good.op, bad.op]));
  assert.deepEqual(result.results.map(r => [r.outcome, r.code ?? null]), [["acknowledged", null], ["conflict", "MENU_MISMATCH"]]);
  assert.equal(result.results[0].order?.totalCents, 1000);
  const espresso = menu.find(m => m.name === "espresso")!;
  assert.deepEqual(espresso.allowedMilk, ["none"], "black drinks have no milk choice");
});

test("lead reset wipes dry-run data but keeps staff, menu and the caller's session", async () => {
  const { db, lead, barista, menu } = await setup();
  const { resetOperationalData } = await import("@/lib/server/lead");
  const tablet = await Tablet.register(db, lead);
  const { op, id } = tablet.create(menu[0]);
  await applySync(db, barista, tablet.batch([op, tablet.advance(id, "collected")]));
  await assert.rejects(resetOperationalData(db, lead, { confirm: "yes" }), /reset/);
  const result = await resetOperationalData(db, lead, { confirm: "reset" });
  assert.deepEqual(result, { orders: 1, devices: 1 });
  for (const table of ["orders", "order_items", "devices", "sync_receipts"]) {
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from bb.${table}`);
    assert.equal(n, 0, table);
  }
  const [{ staffCount }] = await db.query<{ staffCount: number }>(`select count(*)::int as "staffCount" from bb.staff`);
  assert.equal(staffCount, 2);
  assert.equal((await (await import("@/lib/server/lead")).allMenu(db)).length, menu.length);
  const again = await Tablet.register(db, lead);
  assert.equal(again.device.prefix, "A", "letters start again after a reset");
});
