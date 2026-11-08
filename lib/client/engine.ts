"use client";
import { eventDay } from "@/lib/domain/rules";
import type { FeedResponse, Order, SyncResponse, SyncResult } from "@/lib/domain/types";
import { api, ApiError, post, subscribe } from "./api";
import { getMeta, localDb, setMeta, type LocalDevice, type LocalOrder, type LocalProfile } from "./db";
import { rebase } from "./outbox";

export const APP_VERSION = "2.0.0";
const BATCH = 25;

export interface EngineState {
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  auth: "ok" | "expired" | "unknown";
  device: "ok" | "missing" | "revoked" | "unregistered";
  live: "open" | "retrying" | "closed";
}

let state: EngineState = { online: true, syncing: false, lastSyncAt: null, lastError: null, auth: "unknown", device: "unregistered", live: "closed" };
const listeners = new Set<() => void>();
function set(patch: Partial<EngineState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
export const engineStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  get: () => state,
  server: () => state,
};

let users = 0;
let teardown: (() => void) | null = null;
let debounce: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

/** Ref-counted: every staff screen starts it; the last one to unmount stops it. */
export function startEngine(): () => void {
  users++;
  if (users === 1) {
    const kick = () => requestSync();
    const onOnline = () => { set({ online: true }); kick(); };
    const onOffline = () => set({ online: false, live: "closed" });
    const onVisible = () => { if (document.visibilityState === "visible") kick(); };
    set({ online: navigator.onLine });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(kick, 15_000);
    const stopLive = subscribe("/api/staff/live", {
      onEvent: event => { if (event === "change") requestSync(); },
      onState: live => set({ live }),
      onFatal: status => { if (status === 401) set({ auth: "expired" }); },
    });
    kick();
    teardown = () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
      stopLive();
    };
  }
  return () => {
    users--;
    if (users === 0) { teardown?.(); teardown = null; }
  };
}

export function requestSync(): void {
  clearTimeout(debounce);
  debounce = setTimeout(() => void run(), 40);
}

async function run(): Promise<void> {
  if (running) { again = true; return; }
  running = true;
  try {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    // One tab per tablet talks to the server at a time; IndexedDB is shared, so every tab still updates.
    if (locks) await locks.request("bb-sync", { ifAvailable: true }, async lock => { if (lock) await cycle(); });
    else await cycle();
  } finally {
    running = false;
    if (again) { again = false; requestSync(); }
  }
}

async function cycle(): Promise<void> {
  const profile = await getMeta<LocalProfile>("profile");
  const device = await getMeta<LocalDevice>("device");
  set({ device: device ? (state.device === "revoked" || state.device === "missing" ? state.device : "ok") : "unregistered" });
  if (!profile || !navigator.onLine) { set({ online: navigator.onLine }); return; }
  set({ syncing: true });
  try {
    if (device) await push(device);
    await pull(device);
    set({ lastSyncAt: new Date().toISOString(), lastError: null, online: true, auth: "ok" });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) set({ auth: "expired", lastError: "Sign in again to sync. Your saved work is safe on this tablet." });
      else if (error.code === "DEVICE_REVOKED") set({ device: "revoked", lastError: error.message });
      else if (error.code === "DEVICE_UNKNOWN") set({ device: "missing", lastError: error.message });
      else if (error.status === 0) set({ online: navigator.onLine, lastError: error.message });
      else set({ lastError: error.message });
    } else set({ lastError: error instanceof Error ? error.message : "Sync failed." });
  } finally {
    set({ syncing: false });
  }
}

async function push(device: LocalDevice): Promise<void> {
  for (let round = 0; round < 40; round++) {
    const blocked = await localDb.outbox.where("state").equals("blocked").count();
    const rows = (await localDb.outbox.where("state").equals("pending").sortBy("seq")).slice(0, BATCH);
    // A blocked change (sequence gap) holds everything after it until a lead skips the gap.
    if (!rows.length || (blocked && rows[0].seq > (await firstBlockedSeq()))) {
      if (blocked) await heartbeat(device);
      return;
    }
    const pending = await localDb.outbox.count();
    await localDb.outbox.where("opId").anyOf(rows.map(r => r.opId)).modify(row => { row.attempts++; });
    const response = await post<SyncResponse>("/api/sync", { deviceId: device.id, pending, appVersion: APP_VERSION, ops: rows.map(r => r.op) }, { signal: AbortSignal.timeout(20_000) });
    const stop = await applyResults(response.results);
    if (stop) return;
  }
}

async function firstBlockedSeq(): Promise<number> {
  const first = await localDb.outbox.where("state").equals("blocked").sortBy("seq");
  return first[0]?.seq ?? Infinity;
}

async function heartbeat(device: LocalDevice): Promise<void> {
  // Re-send the blocked op so the server can tell whether a lead has skipped the gap.
  const [row] = await localDb.outbox.where("state").equals("blocked").sortBy("seq");
  if (!row) return;
  const response = await post<SyncResponse>("/api/sync", { deviceId: device.id, pending: await localDb.outbox.count(), appVersion: APP_VERSION, ops: [row.op] });
  if (response.results[0]?.outcome !== "gap") {
    await localDb.outbox.where("state").equals("blocked").modify(r => { r.state = "pending"; r.lastError = undefined; });
    await applyResults(response.results);
  }
}

async function applyResults(results: SyncResult[]): Promise<boolean> {
  let stop = false;
  await localDb.transaction("rw", [localDb.outbox, localDb.orders, localDb.issues], async () => {
    for (const result of results) {
      const row = await localDb.outbox.get(result.opId);
      if (!row) continue;
      if (result.outcome === "gap" || result.outcome === "rejected") {
        await localDb.outbox.update(row.opId, { state: "blocked", lastError: result.message });
        stop = true;
        break;
      }
      await localDb.outbox.delete(row.opId);
      if (result.outcome === "conflict") {
        const local = await localDb.orders.get(row.entityId);
        await localDb.issues.put({ id: row.opId, kind: row.kind, entityId: row.entityId, publicNumber: result.order?.publicNumber ?? local?.publicNumber ?? null, code: result.code ?? "CONFLICT", message: result.message ?? "The server couldn't apply this change.", createdAt: new Date().toISOString() });
        if (!result.order && row.kind === "createOrder" && local) await localDb.orders.update(row.entityId, { rejected: { code: result.code ?? "CONFLICT", message: result.message ?? "Rejected" }, localOnly: false });
      }
      if (result.order) await upsertServerOrder(result.order);
    }
  });
  return stop;
}

async function upsertServerOrder(order: Order): Promise<void> {
  const pending = await localDb.outbox.where("entityId").equals(order.id).toArray();
  await localDb.orders.put(rebase({ ...order, localOnly: false, rejected: null }, pending.map(p => p.op)));
}

async function pull(device: LocalDevice | undefined): Promise<void> {
  const day = eventDay();
  const feed = await api<FeedResponse>(`/api/staff/feed?day=${day}${device ? `&deviceId=${device.id}` : ""}`);
  await localDb.transaction("rw", [localDb.orders, localDb.outbox, localDb.menu, localDb.meta], async () => {
    const outbox = await localDb.outbox.toArray();
    const pendingFor = new Map<string, typeof outbox>();
    for (const row of outbox) pendingFor.set(row.entityId, [...(pendingFor.get(row.entityId) ?? []), row]);
    const serverIds = new Set(feed.orders.map(o => o.id));
    for (const order of feed.orders) {
      await localDb.orders.put(rebase({ ...order, localOnly: false, rejected: null } as LocalOrder, (pendingFor.get(order.id) ?? []).map(r => r.op)));
    }
    const stale = await localDb.orders.filter(o => !serverIds.has(o.id) && !o.localOnly && !o.rejected && !pendingFor.has(o.id) && (o.eventDay === day || o.eventDay < day)).primaryKeys();
    await localDb.orders.bulkDelete(stale);
    await localDb.menu.clear();
    await localDb.menu.bulkPut(feed.menu);
    await localDb.meta.put({ key: "menuSyncedAt", value: feed.serverTime });
    if (feed.device && device) {
      if (feed.device.revokedAt) set({ device: "revoked" });
      // Never reuse a sequence the server has already consumed.
      if (!outbox.length && feed.device.nextSequence > device.nextSeq) await localDb.meta.put({ key: "device", value: { ...device, nextSeq: feed.device.nextSequence } });
    }
  });
}

export async function registerThisTablet(label: string): Promise<LocalDevice> {
  const existing = await getMeta<LocalDevice>("device");
  if (existing) throw new Error(`This tablet is already registered as ${existing.prefix}.`);
  const { device } = await post<{ device: { id: string; prefix: string; label: string; nextSequence: number; registeredAt: string } }>("/api/lead/devices", { label });
  const local: LocalDevice = { id: device.id, prefix: device.prefix, label: device.label, nextSeq: device.nextSequence, registeredAt: device.registeredAt };
  await setMeta("device", local);
  set({ device: "ok" });
  requestSync();
  return local;
}

/** Retire this tablet's local identity. Refuses while unsynced work exists. */
export async function forgetThisTablet(options: { force?: boolean } = {}): Promise<void> {
  const pending = await localDb.outbox.count();
  if (pending && !options.force) throw new Error(`${pending} change${pending === 1 ? "" : "s"} still waiting to sync. Sync first.`);
  await localDb.transaction("rw", [localDb.meta, localDb.orders, localDb.tickets, localDb.issues, localDb.outbox], async () => {
    if (options.force) await localDb.outbox.clear();
    for (const row of await localDb.meta.toArray()) if (row.key === "device" || row.key.startsWith("ticket:")) await localDb.meta.delete(row.key);
    await localDb.orders.clear();
    await localDb.tickets.clear();
    await localDb.issues.clear();
  });
  set({ device: "unregistered" });
}

export function markAuth(auth: EngineState["auth"]) { set({ auth }); }
