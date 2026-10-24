import assert from "node:assert/strict";
import { test } from "node:test";
import type { LeadHandlers, SyncOperation } from "../../lib/contracts";
import { toSharedMenuOperation } from "../../lib/client/shared-operation";
import { fixtureMenu, fixtureOrders, FIXTURE_NOW } from "../../lib/client/fixtures";
import { createLeadHandlers } from "../../lib/server/reports/lead-handlers";
import { createHttpAdapters } from "../../lib/client/adapters";

test("menu intent maps to the exact shared SyncOperation without allocating device counters", () => {
  const { id, revision, ...payload } = fixtureMenu[0];
  const operation: SyncOperation = toSharedMenuOperation({ kind: "updateMenu", entityId: id, expectedRevision: revision, payload }, { operationId: "op", deviceId: "device", deviceSequence: 7 });
  assert.equal(operation.deviceSequence, 7); assert.equal(operation.entityId, id);
  assert.equal(operation.payload.id, id); assert.equal(operation.payload.revision, revision);
  assert.deepEqual(operation.payload.allowedTemperatures, ["hot", "iced"]);
});
test("published LeadHandlers interface returns exact rows and integer-cent CSV columns", async () => {
  const handlers: LeadHandlers = createLeadHandlers({ principal: async () => ({ id: "lead", role: "booth_lead" }), menu: { read: async () => { throw new Error("unused"); }, update: async (_id, revision, change) => ({ ...change, id: fixtureMenu[0].id, revision: revision + 1 }) }, readSnapshot: async () => ({ orders: fixtureOrders(), devices: [] }), now: () => new Date(FIXTURE_NOW) });
  const report = await handlers.report("2026-11-26");
  assert.equal(report.reconciliation, "unknown"); assert.equal(report.rows[0].eventDay, "2026-11-26");
  assert.equal(report.rows[0].publicNumber, "1126-A-001"); assert.equal(report.totalCents, 2430);
  assert.ok((await handlers.csv("2026-11-26")).startsWith("\uFEFFeventDay,publicNumber,item,milk,temperature,quantity,unitPriceCents,lineTotalCents,status\r\n"));
  assert.equal((await handlers.updateMenu(fixtureMenu[0], 2)).revision, 3);
});
test("shared LeadHandlers facade still verifies server role before reading data", async () => {
  const handlers = createLeadHandlers({ principal: async () => ({ id: "barista", role: "barista" }), menu: { read: async () => { throw new Error("must not read"); }, update: async () => { throw new Error("must not write"); } }, readSnapshot: async () => { throw new Error("must not read"); } });
  await assert.rejects(handlers.report("2026-11-26"), /Only booth leads/);
  await assert.rejects(handlers.csv("2026-11-26"), /Only booth leads/);
  await assert.rejects(handlers.updateMenu(fixtureMenu[0], 2), /Only booth leads/);
});
test("staff APIs accept the shared bearer session while guest requests keep their own token", async () => {
  const calls: RequestInit[] = [];
  const adapters = createHttpAdapters((async (_url, options) => { calls.push(options!); return Response.json({}); }) as typeof fetch, async () => "staff-session");
  await adapters.report("2026-11-26"); await adapters.guest("guest-token");
  assert.equal(new Headers(calls[0].headers).get("authorization"), "Bearer staff-session");
  assert.equal(new Headers(calls[1].headers).get("authorization"), "Bearer guest-token");
});
