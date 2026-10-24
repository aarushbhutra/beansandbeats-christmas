import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureOrders, FIXTURE_NOW } from "../../lib/client/fixtures";
import { sgtDay } from "../../lib/client/format";
import { calculateDailyReport, validateDay } from "../../lib/server/reports/calculate";
import { csvText, reportCsv } from "../../lib/server/reports/csv";
const now = new Date(FIXTURE_NOW);
const devices = [{ deviceId: "A", prefix: "A", pendingOperations: 0, lastSeenAt: FIXTURE_NOW }];

test("quantities, every lifecycle status, cancellations, historic prices and integer cents", () => {
  const orders = fixtureOrders();
  const before = JSON.stringify(orders);
  const result = calculateDailyReport(orders, "2026-11-26", devices, now);
  assert.deepEqual([result.cups, result.totalCents, result.orderCount], [7, 2430, 4]);
  assert.deepEqual([result.cancelledCups, result.cancelledTotalCents, result.cancelledOrders], [2, 1200, 1]);
  assert.equal(result.rows[0].unitPriceCents, 600); // live menu is 650
  assert.equal(result.reconciliationDetails.complete, true);
  assert.equal(JSON.stringify(orders), before);
});
test("SGT midnight and late sync preserve the assigned event day", () => {
  assert.equal(sgtDay(new Date("2026-11-26T15:59:59.999Z")), "2026-11-26");
  assert.equal(sgtDay(new Date("2026-11-26T16:00:00.000Z")), "2026-11-27");
  const orders = fixtureOrders(); orders[0].receivedAtServer = "2026-11-28T00:00:00Z";
  const result = calculateDailyReport(orders, "2026-11-27", devices, now);
  assert.deepEqual([result.cups, result.totalCents, result.orderCount], [2, 40, 1]);
});
test("fractional dollar sums do not drift and multiple lines are counted", () => {
  const order = fixtureOrders()[0];
  order.items = [{ ...order.items[0], quantity: 1, unitPriceCentsSnapshot: 10 }, { ...order.items[0], quantity: 1, unitPriceCentsSnapshot: 20 }];
  order.totalCents = 30;
  assert.equal(calculateDailyReport([order], "2026-11-26", devices, now).totalCents, 30);
});
test("empty day has zero totals and no invented lines", () => {
  const r = calculateDailyReport(fixtureOrders(), "2026-11-28", devices, now);
  assert.deepEqual([r.cups, r.totalCents, r.rows.length], [0, 0, 0]);
});
test("unknown, stale, pending and future device watermarks cannot imply reconciliation", () => {
  for (const ds of [[], [{ ...devices[0], pendingOperations: null }], [{ ...devices[0], pendingOperations: 1 }], [{ ...devices[0], lastSeenAt: null }], [{ ...devices[0], lastSeenAt: "2026-11-26T03:58:59Z" }], [{ ...devices[0], lastSeenAt: "2026-11-27T04:00:00Z" }]]) {
    const result = calculateDailyReport(fixtureOrders(), "2026-11-26", ds, now);
    assert.equal(result.reconciliationDetails.complete, false);
    assert.ok(result.reconciliationDetails.warnings.length);
  }
});
test("invalid dates, including impossible calendar days, are rejected", () => {
  for (const date of ["", "2026-02-29", "2026-11-31", "2026-1-01", "2026-11-26\r\nX:1"]) assert.throws(() => validateDay(date));
  assert.equal(validateDay("2028-02-29"), "2028-02-29");
});
test("mismatched snapshot totals and duplicate records fail instead of exporting misleading totals", () => {
  const order = fixtureOrders()[0];
  assert.throws(() => calculateDailyReport([{ ...order, totalCents: 1 }], order.eventDay, devices, now));
  assert.throws(() => calculateDailyReport([order, order], order.eventDay, devices, now));
  for (const quantity of [0, -1, .5, Number.MAX_SAFE_INTEGER]) assert.throws(() => calculateDailyReport([{ ...order, items: [{ ...order.items[0], quantity }] }], order.eventDay, devices, now));
});
test("CSV uses the same snapshots and explicitly excludes cancelled amounts", () => {
  const r = calculateDailyReport(fixtureOrders(), "2026-11-26", devices, now);
  const csv = reportCsv(r);
  assert.equal(csv.split("\r\n").length, r.rows.length + 2);
  assert.match(csv, /2,600,1200,"queued"/);
  assert.match(csv, /2,600,1200,"cancelled"/);
  assert.ok(csv.includes("eventDay,publicNumber,item,milk,temperature,quantity,unitPriceCents,lineTotalCents,status"));
  assert.ok(!csv.includes("Jamie")); assert.ok(!csv.includes("token"));
  assert.ok(csv.includes(`"'=HYPERLINK(""https://example.invalid"",""drink"")"`));
});
test("CSV quotes commas, quotes, newlines and neutralizes spreadsheet control prefixes", () => {
  assert.equal(csvText('Oat, "barista"\nblend'), '"Oat, ""barista""\nblend"');
  for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", "  =1", "\t=1", "\r=1", "\n=1", "\u0000=1"]) assert.ok(csvText(value).startsWith('"\''), JSON.stringify(value));
});
