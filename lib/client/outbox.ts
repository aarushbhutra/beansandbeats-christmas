"use client";
import { cleanFirstName, eventDay, judgeTransition, orderTotal, publicNumber, shortNumber } from "@/lib/domain/rules";
import type { OrderItem, OrderStatus, SyncOperation } from "@/lib/domain/types";
import { getMeta, localDb, type LocalDevice, type LocalOrder, type LocalProfile } from "./db";

export class LocalWriteError extends Error {}

function trackingToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Saves an order, its guest token and its sync operation atomically in IndexedDB.
 * Resolves only after the transaction commits, so "saved" always means durable.
 */
export async function createLocalOrder(input: { firstName: string; items: OrderItem[] }): Promise<{ order: LocalOrder; token: string }> {
  const firstName = cleanFirstName(input.firstName);
  if (!firstName) throw new LocalWriteError("Add the guest's first name (up to 40 characters).");
  if (!input.items.length) throw new LocalWriteError("Add at least one drink.");
  const total = orderTotal(input.items);
  const token = trackingToken();
  const id = crypto.randomUUID();
  const opId = crypto.randomUUID();
  const now = new Date().toISOString();
  const day = eventDay();

  return localDb.transaction("rw", [localDb.meta, localDb.orders, localDb.outbox, localDb.tickets], async () => {
    const device = await getMeta<LocalDevice>("device");
    if (!device) throw new LocalWriteError("This tablet isn't registered yet. A booth lead can register it under lead → tablets.");
    const profile = await getMeta<LocalProfile>("profile");
    if (!profile) throw new LocalWriteError("Sign in to take orders.");
    const counterKey = `ticket:${day}`;
    const ticket = (await getMeta<number>(counterKey)) ?? 1;
    const number = publicNumber(day, device.prefix, ticket);
    const order: LocalOrder = {
      id, publicNumber: number, shortNumber: shortNumber(number), deviceId: device.id, deviceSequence: device.nextSeq, eventDay: day, firstName,
      items: input.items, totalCents: total, status: "queued", revision: 0, flags: [], createdAtDevice: now, receivedAtServer: null,
      updatedAtServer: null, makingAt: null, readyAt: null, collectedAt: null, cancelledAt: null, cancellationReason: null, localOnly: true, rejected: null,
    };
    const op: SyncOperation = {
      opId, deviceId: device.id, seq: device.nextSeq, entityId: id, createdAt: now, kind: "createOrder",
      payload: { trackingToken: token, order: { id, publicNumber: number, eventDay: day, firstName, items: input.items, totalCents: total, createdAtDevice: now } },
    };
    await localDb.orders.add(order);
    await localDb.tickets.put({ orderId: id, token, publicNumber: number, createdAt: now });
    await localDb.outbox.add({ opId, seq: op.seq, kind: op.kind, entityId: id, op, state: "pending", attempts: 0, createdAt: now });
    await localDb.meta.put({ key: "device", value: { ...device, nextSeq: device.nextSeq + 1 } });
    await localDb.meta.put({ key: counterKey, value: ticket + 1 });
    return { order, token };
  });
}

/** Moves an order forward (or cancels it) locally and queues the change. */
export async function changeLocalStatus(orderId: string, target: Exclude<OrderStatus, "queued">, reason?: string): Promise<void> {
  if (target === "cancelled" && !reason?.trim()) throw new LocalWriteError("Give a short reason for cancelling.");
  const now = new Date().toISOString();
  await localDb.transaction("rw", [localDb.meta, localDb.orders, localDb.outbox], async () => {
    const device = await getMeta<LocalDevice>("device");
    if (!device) throw new LocalWriteError("This tablet isn't registered yet.");
    const order = await localDb.orders.get(orderId);
    if (!order) throw new LocalWriteError("That order isn't on this tablet.");
    if (order.rejected) throw new LocalWriteError("The server rejected this order. Re-enter it from the sync panel.");
    if (judgeTransition(order.status, target) !== "apply") throw new LocalWriteError(`Order ${order.shortNumber} is already ${order.status}.`);
    const opId = crypto.randomUUID();
    const base = { opId, deviceId: device.id, seq: device.nextSeq, entityId: orderId, createdAt: now };
    const op: SyncOperation = target === "cancelled"
      ? { ...base, kind: "cancelOrder", payload: { reason: reason!.trim().slice(0, 200) } }
      : { ...base, kind: "advanceOrder", payload: { to: target } };
    const stamp = target === "making" ? { makingAt: order.makingAt ?? now } : target === "ready" ? { readyAt: order.readyAt ?? now } : target === "collected" ? { collectedAt: now } : { cancelledAt: now, cancellationReason: reason!.trim() };
    await localDb.outbox.add({ opId, seq: op.seq, kind: op.kind, entityId: orderId, op, state: "pending", attempts: 0, createdAt: now });
    await localDb.orders.update(orderId, { status: target, ...stamp });
    await localDb.meta.put({ key: "device", value: { ...device, nextSeq: device.nextSeq + 1 } });
  });
}

/** Re-applies queued local changes on top of a server copy so the UI never flickers backwards. */
export function rebase(server: LocalOrder, pending: SyncOperation[]): LocalOrder {
  let order = { ...server };
  for (const op of pending.sort((a, b) => a.seq - b.seq)) {
    if (op.kind === "advanceOrder" && judgeTransition(order.status, op.payload.to) === "apply") order = { ...order, status: op.payload.to };
    if (op.kind === "cancelOrder" && judgeTransition(order.status, "cancelled") === "apply") order = { ...order, status: "cancelled", cancellationReason: op.payload.reason };
  }
  return order;
}
