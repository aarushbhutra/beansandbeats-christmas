"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, useSyncExternalStore } from "react";
import { eventDay } from "@/lib/domain/rules";
import type { MenuItem } from "@/lib/domain/types";
import { api, ApiError, post } from "./api";
import { getMeta, localDb, setMeta, type LocalDevice, type LocalOrder, type LocalProfile, type SyncIssue, type Ticket } from "./db";
import { engineStore, markAuth, requestSync } from "./engine";

export function useEngine() {
  return useSyncExternalStore(engineStore.subscribe, engineStore.get, engineStore.server);
}

export function useProfile(): LocalProfile | null | undefined {
  return useLiveQuery(async () => (await getMeta<LocalProfile>("profile")) ?? null, [], undefined);
}

export function useDevice(): LocalDevice | null | undefined {
  return useLiveQuery(async () => (await getMeta<LocalDevice>("device")) ?? null, [], undefined);
}

export function useMenu(): MenuItem[] | undefined {
  return useLiveQuery(() => localDb.menu.orderBy("sortOrder").toArray(), [], undefined);
}

export function useMenuSyncedAt(): string | null {
  return useLiveQuery(async () => (await getMeta<string>("menuSyncedAt")) ?? null, [], null);
}

export function useOrders(day = eventDay()): LocalOrder[] | undefined {
  return useLiveQuery(() => localDb.orders.where("eventDay").equals(day).toArray(), [day], undefined);
}

export function useOutbox() {
  return useLiveQuery(async () => {
    const rows = await localDb.outbox.toArray();
    return { count: rows.length, blocked: rows.filter(r => r.state === "blocked"), entities: new Set(rows.map(r => r.entityId)), oldest: rows.reduce<string | null>((min, r) => (!min || r.createdAt < min ? r.createdAt : min), null) };
  }, [], { count: 0, blocked: [], entities: new Set<string>(), oldest: null });
}

export function useIssues(): SyncIssue[] {
  return useLiveQuery(() => localDb.issues.orderBy("createdAt").reverse().toArray(), [], []);
}

export function useTicket(orderId: string | null): Ticket | null | undefined {
  return useLiveQuery(async () => (orderId ? (await localDb.tickets.get(orderId)) ?? null : null), [orderId], undefined);
}

/** Ticks every `ms` so relative times ("3m ago") stay fresh. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/* ---------- Session ---------- */

export async function signIn(username: string, password: string): Promise<LocalProfile> {
  const result = await post<{ staff: Omit<LocalProfile, "expiresAt" | "verifiedAt">; expiresAt: string }>("/api/auth/login", { username, password });
  const profile: LocalProfile = { ...result.staff, expiresAt: result.expiresAt, verifiedAt: new Date().toISOString() };
  await setMeta("profile", profile);
  markAuth("ok");
  requestSync();
  return profile;
}

/** Signing out stops server access. Unsynced changes stay queued on the tablet for the next sign-in. */
export async function signOut(): Promise<void> {
  try { await post("/api/auth/logout", {}); } catch { /* offline: cookie expires on its own */ }
  await localDb.meta.delete("profile");
}

/** Confirms the cookie session when online; clears the cached profile only on a definite 401. */
export async function verifySession(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const me = await api<{ staff: Omit<LocalProfile, "expiresAt" | "verifiedAt">; expiresAt: string }>("/api/auth/me");
    await setMeta("profile", { ...me.staff, expiresAt: me.expiresAt, verifiedAt: new Date().toISOString() });
    markAuth("ok");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) { await localDb.meta.delete("profile"); markAuth("expired"); }
  }
}
