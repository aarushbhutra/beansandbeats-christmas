import { endOfEventDay, sgtHour } from "./rules";
import type { DailyReport, Device, DeviceReconciliation, Order, ReportRow } from "./types";

export const SALES_DEFINITION =
  "Recorded orders: queued, making, ready and collected count towards cups and value. Cancelled orders are listed but excluded. These are booth records, not verified POS payments.";

const FRESH_MS = 5 * 60 * 1000;

export function deviceState(device: Device, day: string, now: Date): DeviceReconciliation["state"] {
  if (device.revokedAt) return "revoked";
  if (device.pendingOps === null || !device.lastSeenAt) return "unknown";
  if (device.pendingOps > 0) return "pending";
  const seen = Date.parse(device.lastSeenAt);
  // Clean when it reported an empty outbox recently, or after the event day ended.
  if (now.getTime() - seen <= FRESH_MS || seen >= endOfEventDay(day).getTime()) return "clean";
  return "unknown";
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export function calculateDailyReport(input: {
  day: string;
  orders: Order[];
  devices: Device[];
  now?: Date;
  closure?: DailyReport["closure"];
}): DailyReport {
  const now = input.now ?? new Date();
  const rows: ReportRow[] = [];
  const hourly = new Map<number, { cups: number; totalCents: number }>();
  const items = new Map<string, { cups: number; totalCents: number }>();
  const milk = new Map<string, number>();
  const temperature = { hot: 0, iced: 0 };
  const prepSamples: number[] = [];
  let orders = 0, cups = 0, totalCents = 0, cancelledOrders = 0, cancelledCups = 0, cancelledTotalCents = 0, openOrders = 0, flaggedOrders = 0;
  const seen = new Set<string>();

  const sorted = [...input.orders].filter(order => order.eventDay === input.day).sort((a, b) => a.publicNumber.localeCompare(b.publicNumber));
  for (const order of sorted) {
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    let orderCups = 0, orderTotal = 0;
    for (const item of order.items) {
      const lineTotal = item.quantity * item.unitPriceCentsSnapshot;
      orderCups += item.quantity;
      orderTotal += lineTotal;
      rows.push({
        eventDay: order.eventDay, publicNumber: order.publicNumber, orderedAt: order.createdAtDevice, item: item.nameSnapshot,
        milk: item.milk, temperature: item.temperature, quantity: item.quantity, unitPriceCents: item.unitPriceCentsSnapshot,
        lineTotalCents: lineTotal, status: order.status, flags: order.flags.join(" "),
      });
    }
    if (orderTotal !== order.totalCents) throw new Error(`Order ${order.publicNumber} total differs from its item snapshots`);
    if (order.flags.length) flaggedOrders++;
    if (order.status === "cancelled") {
      cancelledOrders++; cancelledCups += orderCups; cancelledTotalCents += orderTotal;
      continue;
    }
    orders++; cups += orderCups; totalCents += orderTotal;
    if (order.status !== "collected") openOrders++;
    const hour = sgtHour(order.createdAtDevice);
    const bucket = hourly.get(hour) ?? { cups: 0, totalCents: 0 };
    bucket.cups += orderCups; bucket.totalCents += orderTotal; hourly.set(hour, bucket);
    for (const item of order.items) {
      const entry = items.get(item.nameSnapshot) ?? { cups: 0, totalCents: 0 };
      entry.cups += item.quantity; entry.totalCents += item.quantity * item.unitPriceCentsSnapshot;
      items.set(item.nameSnapshot, entry);
      milk.set(item.milk, (milk.get(item.milk) ?? 0) + item.quantity);
      temperature[item.temperature] += item.quantity;
    }
    if (order.readyAt && order.receivedAtServer) {
      const start = Math.min(Date.parse(order.createdAtDevice), Date.parse(order.receivedAtServer));
      const seconds = Math.round((Date.parse(order.readyAt) - start) / 1000);
      if (seconds >= 0 && seconds < 4 * 3600) prepSamples.push(seconds);
    }
  }
  prepSamples.sort((a, b) => a - b);

  const devices = input.devices.map(device => ({
    deviceId: device.id, prefix: device.prefix, label: device.label, pendingOps: device.pendingOps,
    lastSeenAt: device.lastSeenAt, state: deviceState(device, input.day, now),
  }));
  const warnings: string[] = [];
  if (!devices.some(device => device.state !== "revoked")) warnings.push("No registered tablets have reported in yet.");
  for (const device of devices) {
    if (device.state === "pending") warnings.push(`Tablet ${device.prefix} (${device.label}) still has ${device.pendingOps} unsynced change${device.pendingOps === 1 ? "" : "s"}.`);
    if (device.state === "unknown") warnings.push(`Tablet ${device.prefix} (${device.label}) has not confirmed an empty outbox recently. Open it online to reconcile.`);
  }
  if (openOrders) warnings.push(`${openOrders} order${openOrders === 1 ? " is" : "s are"} not yet collected.`);
  if (flaggedOrders) warnings.push(`${flaggedOrders} order${flaggedOrders === 1 ? " was" : "s were"} sold against an out-of-date menu. Review flagged rows.`);

  return {
    day: input.day,
    generatedAt: now.toISOString(),
    definition: SALES_DEFINITION,
    orders, cups, totalCents,
    averageOrderCents: orders ? Math.round(totalCents / orders) : 0,
    cancelledOrders, cancelledCups, cancelledTotalCents, openOrders, flaggedOrders,
    prep: { medianSeconds: percentile(prepSamples, 0.5), p90Seconds: percentile(prepSamples, 0.9), samples: prepSamples.length },
    hourly: [...hourly.entries()].sort((a, b) => a[0] - b[0]).map(([hour, value]) => ({ hour, ...value })),
    topItems: [...items.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.cups - a.cups || a.name.localeCompare(b.name)),
    milk: [...milk.entries()].map(([name, count]) => ({ name, cups: count })).sort((a, b) => b.cups - a.cups),
    temperature,
    devices,
    reconciliation: { complete: !devices.some(d => d.state === "pending" || d.state === "unknown") && devices.some(d => d.state !== "revoked") && !openOrders, warnings },
    rows,
    closure: input.closure ?? null,
  };
}
