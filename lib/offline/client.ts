"use client";
import {useLiveQuery} from "dexie-react-hooks";
import type {SyncOperation, SyncState} from "../contracts";
import {db} from "./db";
export function useMenu() { return useLiveQuery(() => db.menu.toArray(), [], []); }
export function useOrders() { return useLiveQuery(() => db.orders.toArray(), [], []); }
// Low-level legacy enqueue. Use createLocalOrder/advanceLocalOrder for device-counter-safe writes.
// updateMenu remains reserved until the second contributor integrates its server handler.
export async function submitOperation(operation: SyncOperation): Promise<void> {
 await db.transaction("rw", db.orders, db.outbox, async () => {
  if (await db.outbox.get(operation.operationId)) return;
  if (operation.kind === "createOrder") await db.orders.add(operation.payload.order);
  await db.outbox.add({operationId:operation.operationId,operation,state:"pending"});
 });
}
export async function getSyncState(): Promise<SyncState> {
 return {pending:await db.outbox.where("state").equals("pending").count(),blocked:await db.outbox.where("state").equals("blocked").count(),online:navigator.onLine};
}
