/** DEVELOPMENT FIXTURES ONLY. Never mount this router in the event app. */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { asGuest, FIXTURE_TOKEN, fixtureMenu, fixtureOrders } from "../../lib/client/fixtures";
import type { MenuChange, MenuOperation, OrderStatus } from "../../lib/client/contracts";
import { apiError, createMenuHandlers, HandlerError, type StaffPrincipal } from "../../lib/server/menu";
import { createReportHandlers } from "../../lib/server/reports";

type State = { menu: typeof fixtureMenu; orders: ReturnType<typeof fixtureOrders>; receipts: string[]; unknownDevice: boolean; revision: number };
const stateFile = path.join(process.cwd(), ".data", "fixtures.json");
const globalStore = globalThis as unknown as { person2FixtureQueue?: Promise<unknown> };
function seed(): State { return { menu: structuredClone(fixtureMenu), orders: fixtureOrders(), receipts: [], unknownDevice: true, revision: 2 }; }
async function serialized<T>(action: (state: State) => Promise<T> | T, save = false): Promise<T> {
  const next = (globalStore.person2FixtureQueue ?? Promise.resolve()).catch(() => {}).then(async () => {
    let state: State;
    try { state = JSON.parse(await readFile(stateFile, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = seed(); }
    const result = await action(state);
    if (save) { await mkdir(path.dirname(stateFile), { recursive: true }); await writeFile(`${stateFile}.tmp`, JSON.stringify(state)); await rename(`${stateFile}.tmp`, stateFile); }
    return result;
  });
  globalStore.person2FixtureQueue = next;
  return next;
}
async function authenticate(request: Request): Promise<StaffPrincipal | null> {
  const role = request.headers.get("cookie")?.match(/(?:^|;\s*)p2-preview-role=(booth-lead|barista)(?:;|$)/)?.[1];
  return role ? { id: "preview-staff-only", role: role as StaffPrincipal["role"] } : null;
}
const menus = createMenuHandlers({ authenticate, repository: {
  read: includeInactive => serialized(state => ({ items: state.menu.filter(item => includeInactive || item.active), revision: state.revision, syncedAt: new Date().toISOString() })),
  update: (id, revision, change) => serialized(state => {
    const item = state.menu.find(item => item.id === id);
    if (!item || item.revision !== revision) return null;
    Object.assign(item, change, { revision: revision + 1 }); state.revision++;
    return { ...item };
  }, true),
} });
const reports = createReportHandlers({ authenticate, readSnapshot: () => serialized(state => ({ orders: state.orders, devices: [{ deviceId: "fixture-A", prefix: "A", pendingOperations: 0, lastSeenAt: new Date().toISOString() }, ...(state.unknownDevice ? [{ deviceId: "fixture-B", prefix: "B", pendingOperations: null, lastSeenAt: null }] : [])] })) });
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store" } }); }

export async function previewRoute(request: Request): Promise<Response> {
  const url = new URL(request.url); const route = url.pathname;
  // Even a build must be deliberately enabled; this preview is intended for loopback only.
  if (process.env.NODE_ENV === "production" && process.env.PERSON2_PREVIEW_ENABLED !== "1") return json({ error: { code: "PREVIEW_DISABLED", message: "Development fixtures are disabled." } }, 503);
  try {
    if (route === "/api/menu" && request.method === "GET") return menus.get(request);
    if (route === "/api/lead/reports" && request.method === "GET") return reports.json(request);
    if (route === "/api/lead/reports.csv" && request.method === "GET") return reports.csv(request);
    if (/^\/api\/lead\/menu\//.test(route) && request.method === "PATCH") return menus.patch(request, route.split("/").at(-1)!);
    if (route === "/api/guest/status" && request.method === "GET") {
      if (request.headers.get("authorization") !== `Bearer ${FIXTURE_TOKEN}`) return json({ error: { code: "NOT_FOUND", message: "Order unavailable." } }, 404);
      return serialized(state => json({ order: asGuest(state.orders[0]), syncedAt: new Date().toISOString() }));
    }
    if (route === "/api/ready" && request.method === "GET") return serialized(state => json({ orders: state.orders.filter(order => order.status === "ready").map(order => ({ firstName: order.firstName, publicNumber: order.publicNumber })), syncedAt: new Date().toISOString() }));
    if (route === "/api/preview/session") {
      if (request.method === "GET") return json({ actor: await authenticate(request) });
      const { role } = await request.json();
      if (!["barista", "booth-lead", "guest"].includes(role)) throw new HandlerError(400, "INVALID_INPUT", "Choose a preview role.");
      return Response.json({ ok: true }, { headers: { "Set-Cookie": `p2-preview-role=${role}; Path=/; HttpOnly; SameSite=Strict`, "Cache-Control": "no-store" } });
    }
    if (route === "/api/preview/state" && request.method === "GET") return serialized(state => json({ orders: state.orders.map(order => ({ publicNumber: order.publicNumber, firstName: order.firstName, status: order.status })), unknownDevice: state.unknownDevice }));
    if (route === "/api/preview/reset" && request.method === "POST") return serialized(state => { Object.assign(state, seed()); return json({ ok: true }); }, true);
    if (route === "/api/preview/status" && request.method === "POST") {
      const { status } = await request.json();
      if (!["queued", "making", "ready", "collected", "cancelled"].includes(status)) throw new HandlerError(400, "INVALID_INPUT", "Unknown fixture status.");
      return serialized(state => { state.orders[0].status = status as OrderStatus; state.orders[0].updatedAtServer = new Date().toISOString(); return json({ ok: true }); }, true);
    }
    if (route === "/api/preview/devices" && request.method === "POST") {
      const { unknown } = await request.json();
      return serialized(state => { state.unknownDevice = !!unknown; return json({ ok: true }); }, true);
    }
    if (route === "/api/preview/conflict" && request.method === "POST") return serialized(state => { state.menu[0].priceCents += 25; state.menu[0].revision++; state.revision++; return json({ ok: true }); }, true);
    if (route === "/api/preview/operation" && request.method === "POST") {
      const operation = await request.json() as MenuOperation & { operationId: string };
      if (!/^[0-9a-f-]{36}$/i.test(operation.operationId)) throw new HandlerError(400, "INVALID_INPUT", "Operation ID required.");
      const actor = await authenticate(request);
      if (actor?.role !== "booth-lead") throw new HandlerError(actor ? 403 : 401, "FORBIDDEN", "Choose the lead preview role.");
      // Fixture receipt only. Production receipts and transactional sync belong to Person 1.
      return await serialized(async state => {
        if (state.receipts.includes(operation.operationId)) return json({ state: "acknowledged", operationId: operation.operationId });
        const { validateMenuChange } = await import("../../lib/server/menu");
        const change: MenuChange = validateMenuChange(operation.payload);
        const item = state.menu.find(item => item.id === operation.entityId);
        if (operation.kind !== "updateMenu" || !item || item.revision !== operation.expectedRevision) throw new HandlerError(409, "REVISION_CONFLICT", "Preview conflict: another tablet changed this item. Review current values in the menu.");
        Object.assign(item, change, { revision: item.revision + 1 }); state.revision++;
        state.receipts.push(operation.operationId);
        return json({ state: "acknowledged", operationId: operation.operationId });
      }, true);
    }
    return json({ error: { code: "NOT_FOUND", message: "Unknown preview endpoint." } }, 404);
  } catch (error) { return apiError(error); }
}
