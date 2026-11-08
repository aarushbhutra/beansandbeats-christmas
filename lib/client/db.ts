"use client";
import Dexie, { type EntityTable } from "dexie";
import type { MenuItem, Order, Role, SyncOperation } from "@/lib/domain/types";

export interface LocalDevice { id: string; prefix: string; label: string; nextSeq: number; registeredAt: string }
export interface LocalProfile { id: string; username: string; displayName: string; role: Role; expiresAt: string; verifiedAt: string }
export interface LocalOrder extends Order {
  /** Created on this tablet and not yet acknowledged by the server. */
  localOnly: boolean;
  /** Server refused the create; kept so staff can see and redo it. */
  rejected?: { code: string; message: string } | null;
}
export interface OutboxRow {
  opId: string;
  seq: number;
  kind: SyncOperation["kind"];
  entityId: string;
  op: SyncOperation;
  state: "pending" | "blocked";
  attempts: number;
  lastError?: string;
  createdAt: string;
}
export interface Ticket { orderId: string; token: string; publicNumber: string; createdAt: string }
export interface SyncIssue { id: string; kind: string; entityId: string; publicNumber: string | null; code: string; message: string; createdAt: string }
export interface MetaRow { key: string; value: unknown }

/**
 * Operational data for a registered booth tablet. Separate from the service-worker cache.
 * Holds first names and tracking tokens: use dedicated booth tablets only.
 */
export const localDb = new Dexie("beansandbeats-tablet-v2") as Dexie & {
  meta: EntityTable<MetaRow, "key">;
  menu: EntityTable<MenuItem, "id">;
  orders: EntityTable<LocalOrder, "id">;
  outbox: EntityTable<OutboxRow, "opId">;
  tickets: EntityTable<Ticket, "orderId">;
  issues: EntityTable<SyncIssue, "id">;
};

localDb.version(1).stores({
  meta: "key",
  menu: "id, sortOrder",
  orders: "id, eventDay, status, publicNumber",
  outbox: "opId, &seq, state, entityId",
  tickets: "orderId",
  issues: "id, createdAt",
});

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await localDb.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await localDb.meta.put({ key, value });
}
