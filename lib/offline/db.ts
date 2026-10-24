"use client";
import Dexie, {type EntityTable} from "dexie";
import type { Device, MenuItem, Order, SyncOperation } from "../contracts";
export type OutboxRow = { operationId: string; operation: SyncOperation; state: "pending" | "blocked"; message?: string };
export const db = new Dexie("beansandbeats-v1") as Dexie & { menu: EntityTable<MenuItem,"id">; orders: EntityTable<Order,"id">; devices: EntityTable<Device,"id">; outbox: EntityTable<OutboxRow,"operationId"> };
db.version(1).stores({menu:"id",orders:"id, eventDay, status, publicNumber",devices:"id, &prefix",outbox:"operationId, state, [operation.deviceId+operation.deviceSequence]"});
