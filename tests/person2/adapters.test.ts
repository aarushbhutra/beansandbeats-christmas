import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createHttpAdapters, tokenFromFragment } from "../../lib/client/adapters";
import { createMockPublicAdapter, FIXTURE_TOKEN } from "../../lib/client/fixtures";
test("guest token appears only in Authorization, never a request URL", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const adapter = createHttpAdapters((async (url, options) => { calls.push({ url: String(url), options: options! }); return Response.json({ order: {} }); }) as typeof fetch);
  await adapter.guest(FIXTURE_TOKEN);
  assert.equal(calls[0].url, "/api/guest/status");
  assert.equal((calls[0].options.headers as Record<string, string>).Authorization, `Bearer ${FIXTURE_TOKEN}`);
  assert.equal(calls[0].options.cache, "no-store");
  assert.ok(!calls[0].url.includes(FIXTURE_TOKEN));
});
test("fragment tokens require a high-entropy-compatible shape", () => {
  assert.equal(tokenFromFragment(`#token=${FIXTURE_TOKEN}`), FIXTURE_TOKEN);
  assert.equal(tokenFromFragment(`#${"ab".repeat(32)}`), "ab".repeat(32));
  for (const value of ["", "#token=1", "#token=<script>", "?token=" + FIXTURE_TOKEN]) assert.equal(tokenFromFragment(value), null);
});
test("adapters normalize the published persisted guest, ready and menu response shapes", async () => {
  const date = new Date().toUTCString();
  const adapter = createHttpAdapters((async url => Response.json(String(url).includes("guest") ? { publicNumber: "1126-A-001", status: "ready", updatedAt: date, items: [] } : String(url).includes("ready") ? { orders: [], updatedAt: date } : { items: [{ revision: 3 }] }, { headers: { Date: date } })) as typeof fetch);
  assert.equal((await adapter.guest(FIXTURE_TOKEN)).order.publicNumber, "1126-A-001");
  assert.equal((await adapter.guest(FIXTURE_TOKEN)).syncedAt, date);
  assert.equal((await adapter.ready()).syncedAt, date);
  assert.equal((await adapter.menu()).revision, 3);
});
test("HTTP failures preserve structured API codes and sanitize non-JSON failures", async () => {
  const adapter = createHttpAdapters((async () => Response.json({ error: { code: "NOT_FOUND", message: "Unavailable" } }, { status: 404 })) as typeof fetch);
  await assert.rejects(adapter.guest(FIXTURE_TOKEN), e => e instanceof ApiError && e.status === 404 && e.code === "NOT_FOUND");
  const bad = createHttpAdapters((async () => new Response("private stack", { status: 500 })) as typeof fetch);
  await assert.rejects(bad.ready(), e => e instanceof ApiError && !e.message.includes("stack"));
});
test("mock adapter shares the public contract, removes collected orders, supports outages", async () => {
  const mock = createMockPublicAdapter();
  assert.equal((await mock.guest(FIXTURE_TOKEN)).order.status, "queued");
  mock.setStatus(0, "ready"); assert.equal((await mock.ready()).orders.length, 2);
  mock.setStatus(0, "collected"); assert.equal((await mock.ready()).orders.length, 1);
  assert.deepEqual(Object.keys((await mock.ready()).orders[0]).sort(), ["firstName", "publicNumber"]);
  mock.setOffline(true); await assert.rejects(mock.ready());
});
