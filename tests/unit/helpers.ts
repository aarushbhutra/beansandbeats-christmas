import { randomBytes, randomUUID } from "node:crypto";
import { createMemoryDb, type Database } from "@/lib/server/db";
import { allMenu, registerDevice } from "@/lib/server/lead";
import { hashPassword } from "@/lib/server/passwords";
import type { Principal } from "@/lib/server/auth";
import { eventDay, orderTotal, publicNumber } from "@/lib/domain/rules";
import type { Device, MenuItem, SyncOperation } from "@/lib/domain/types";

export async function setup() {
  const db = await createMemoryDb();
  const lead = await staff(db, "lead", "lead");
  const barista = await staff(db, "barista", "barista");
  const menu = await allMenu(db);
  return { db, lead, barista, menu };
}

export async function staff(db: Database, username: string, role: "lead" | "barista"): Promise<Principal> {
  const [row] = await db.query<{ id: string }>(
    "insert into bb.staff(username, display_name, role, password_hash) values ($1,$1,$2,$3) returning id",
    [username, role, await hashPassword("correct horse battery")]);
  return { id: row.id, username, displayName: username, role, sessionId: randomUUID(), expiresAt: new Date(Date.now() + 3600_000).toISOString() };
}

/** Minimal tablet simulator: allocates sequences and ticket numbers like the browser outbox. */
export class Tablet {
  seq = 1;
  ticket = 1;
  constructor(public device: Device) {}
  static async register(db: Database, lead: Principal, label = "counter") {
    return new Tablet(await registerDevice(db, lead, { label }));
  }
  create(menu: MenuItem, options: { name?: string; quantity?: number; day?: string; milk?: string; price?: number; revision?: number } = {}) {
    const day = options.day ?? eventDay();
    const items = [{ menuItemId: menu.id, menuRevision: options.revision ?? menu.revision, nameSnapshot: menu.name, unitPriceCentsSnapshot: options.price ?? menu.priceCents, quantity: options.quantity ?? 1, milk: options.milk ?? menu.allowedMilk[0], temperature: menu.allowedTemperatures[0] }];
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const op: SyncOperation = {
      opId: randomUUID(), deviceId: this.device.id, seq: this.seq++, entityId: id, createdAt: new Date().toISOString(), kind: "createOrder",
      payload: { trackingToken: token, order: { id, publicNumber: publicNumber(day, this.device.prefix, this.ticket++), eventDay: day, firstName: options.name ?? "Jamie", items, totalCents: orderTotal(items), createdAtDevice: new Date().toISOString() } },
    };
    return { op, id, token };
  }
  advance(orderId: string, to: "making" | "ready" | "collected"): SyncOperation {
    return { opId: randomUUID(), deviceId: this.device.id, seq: this.seq++, entityId: orderId, createdAt: new Date().toISOString(), kind: "advanceOrder", payload: { to } };
  }
  cancel(orderId: string, reason = "guest changed mind"): SyncOperation {
    return { opId: randomUUID(), deviceId: this.device.id, seq: this.seq++, entityId: orderId, createdAt: new Date().toISOString(), kind: "cancelOrder", payload: { reason } };
  }
  batch(ops: SyncOperation[], pending = ops.length) {
    return { deviceId: this.device.id, pending, ops };
  }
}
