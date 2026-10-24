import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureMenu, fixtureOrders, FIXTURE_NOW } from "../../lib/client/fixtures";
import { createMenuHandlers, validateMenuChange, type StaffPrincipal } from "../../lib/server/menu";
import { createReportHandlers } from "../../lib/server/reports";

const lead: StaffPrincipal = { id: "lead", role: "booth-lead" };
const barista: StaffPrincipal = { id: "barista", role: "barista" };
const { id, revision, ...change } = fixtureMenu[0];
function request(body: unknown) { return new Request("https://example.invalid/api/lead/menu/" + id, { method: "PATCH", body: JSON.stringify(body) }); }
test("menu handlers enforce anonymous/barista/lead permissions at the server", async () => {
  for (const [actor, expected] of [[null, 401], [barista, 403], [lead, 200]] as const) {
    let writes = 0;
    const h = createMenuHandlers({ authenticate: async () => actor, repository: { read: async () => ({ items: fixtureMenu, revision: 2, syncedAt: FIXTURE_NOW }), update: async () => { writes++; return fixtureMenu[0]; } } });
    const result = await h.patch(request({ expectedRevision: revision, change }), id);
    assert.equal(result.status, expected); assert.equal(writes, actor === lead ? 1 : 0);
    const menu = await (await h.get(new Request("https://example.invalid/api/menu"))).json();
    assert.equal(menu.items.length, actor === lead ? 4 : 3);
  }
});
test("revision conflicts and invalid updates never silently overwrite", async () => {
  let writes = 0;
  const h = createMenuHandlers({ authenticate: async () => lead, repository: { read: async () => { throw new Error("unused"); }, update: async () => { writes++; return null; } } });
  assert.equal((await h.patch(request({ expectedRevision: 1, change }), id)).status, 409);
  assert.equal((await h.patch(request({ expectedRevision: -1, change }), id)).status, 400);
  assert.equal((await h.patch(request({ expectedRevision: 1, change: { ...change, priceCents: 1.2 } }), id)).status, 400);
  assert.equal((await h.patch(request({ expectedRevision: 1, change }), "bad-id")).status, 400);
  assert.equal(writes, 1);
});
test("menu input rejects unknown fields, invalid prices, empty/duplicate modifier options", () => {
  for (const value of [{ ...change, role: "booth-lead" }, { ...change, priceCents: -1 }, { ...change, priceCents: 100001 }, { ...change, allowedMilk: [] }, { ...change, allowedMilk: ["Oat", "oat"] }, { ...change, active: "yes" }, { ...change, name: "\r\n" }]) assert.throws(() => validateMenuChange(value));
  assert.equal(validateMenuChange({ ...change, priceCents: 0 }).priceCents, 0);
});
test("report and CSV deny unauthorized access before reading private snapshots", async () => {
  for (const actor of [null, barista, lead]) {
    let reads = 0;
    const h = createReportHandlers({ authenticate: async () => actor, readSnapshot: async () => { reads++; return { orders: fixtureOrders(), devices: [] }; }, now: () => new Date(FIXTURE_NOW) });
    const req = new Request("https://example.invalid/api/lead/reports?day=2026-11-26");
    for (const handler of [h.json, h.csv]) assert.equal((await handler(req)).status, actor === lead ? 200 : actor ? 403 : 401);
    assert.equal(reads, actor === lead ? 2 : 0);
  }
});
test("JSON and CSV share report definition and protect incomplete exports", async () => {
  const h = createReportHandlers({ authenticate: async () => lead, readSnapshot: async () => ({ orders: fixtureOrders(), devices: [] }), now: () => new Date(FIXTURE_NOW) });
  const response = await h.csv(new Request("https://example.invalid/api/lead/reports.csv?day=2026-11-26"));
  assert.equal(response.headers.get("x-reconciliation-complete"), "false");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(await response.text(), /,true,false\r\n/);
  assert.equal((await h.json(new Request("https://example.invalid/api/lead/reports?day=2026-11-31"))).status, 400);
});
test("unexpected repository errors do not leak secrets through API messages", async () => {
  const h = createReportHandlers({ authenticate: async () => lead, readSnapshot: async () => { throw new Error("private service credential"); } });
  const response = await h.json(new Request("https://example.invalid/api/lead/reports?day=2026-11-26"));
  assert.equal(response.status, 500); assert.ok(!(await response.text()).includes("credential"));
});
