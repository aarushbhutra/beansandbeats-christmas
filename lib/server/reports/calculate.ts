import type { DailyReport, DeviceFreshness, OrderStatus, ReportLine, SalesOrder } from "../../client/contracts";
import { HandlerError } from "../menu";

export const INCLUDED_STATUSES: readonly OrderStatus[] = ["queued", "making", "ready", "collected"];
export const SALES_DEFINITION = "Recorded orders: queued, making, ready and collected. Cancelled orders excluded. These are not verified POS payments.";
export function validateDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new HandlerError(400, "INVALID_DAY", "Choose a valid SGT date (YYYY-MM-DD).");
  return day;
}
function whole(value: number, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new HandlerError(500, "INVALID_REPORT_DATA", `Invalid ${field} in stored order snapshots.`);
  return value;
}
function add(a: number, b: number): number { return whole(a + b, "aggregate"); }
export function calculateDailyReport(orders: readonly SalesOrder[], day: string, devices: readonly DeviceFreshness[], now = new Date()): DailyReport {
  validateDay(day);
  const lines: ReportLine[] = [];
  let orderCount = 0, cups = 0, totalCents = 0, cancelledOrders = 0, cancelledCups = 0, cancelledTotalCents = 0;
  const seenIds = new Set<string>();
  const seenNumbers = new Set<string>();
  for (const order of orders) {
    // eventDay is fixed at order creation in SGT, including delayed offline orders.
    if (order.eventDay !== day) continue;
    if (seenIds.has(order.id) || seenNumbers.has(order.publicNumber)) throw new HandlerError(500, "INVALID_REPORT_DATA", "Duplicate orders in report input.");
    seenIds.add(order.id); seenNumbers.add(order.publicNumber);
    if (![...INCLUDED_STATUSES, "cancelled"].includes(order.status) || !order.items.length) throw new HandlerError(500, "INVALID_REPORT_DATA", "Invalid order in report input.");
    let orderCups = 0, orderTotal = 0;
    for (const item of order.items) {
      const quantity = whole(item.quantity, "quantity", 1);
      const unitPriceCents = whole(item.unitPriceCentsSnapshot, "price");
      const lineTotalCents = whole(quantity * unitPriceCents, "line total");
      orderCups = add(orderCups, quantity); orderTotal = add(orderTotal, lineTotalCents);
      lines.push({ eventDay: day, publicNumber: order.publicNumber, item: item.nameSnapshot, milk: item.milk, temperature: item.temperature, quantity, unitPriceCents, lineTotalCents, status: order.status });
    }
    if (whole(order.totalCents, "order total") !== orderTotal) throw new HandlerError(500, "INVALID_REPORT_DATA", "Stored order total differs from its immutable item snapshots.");
    if (order.status === "cancelled") { cancelledOrders++; cancelledCups = add(cancelledCups, orderCups); cancelledTotalCents = add(cancelledTotalCents, orderTotal); }
    else { orderCount++; cups = add(cups, orderCups); totalCents = add(totalCents, orderTotal); }
  }
  const warnings: string[] = [];
  if (!devices.length) warnings.push("Registered-device freshness is unknown. Reconcile all booth tablets before closing the day.");
  for (const device of devices) {
    if (device.pendingOperations === null || !Number.isSafeInteger(device.pendingOperations) || device.pendingOperations < 0) warnings.push(`Tablet ${device.prefix}: pending operation count is unknown.`);
    else if (device.pendingOperations > 0) warnings.push(`Tablet ${device.prefix}: ${device.pendingOperations} operations are still pending.`);
    const seen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : NaN;
    if (!Number.isFinite(seen) || now.getTime() - seen > 60000 || seen > now.getTime() + 5000) warnings.push(`Tablet ${device.prefix}: freshness is unknown or older than one minute.`);
  }
  lines.sort((a, b) => a.publicNumber.localeCompare(b.publicNumber));
  const reconciliation = !warnings.length ? "complete" : devices.some(device => (device.pendingOperations ?? 0) > 0) ? "pending" : "unknown";
  return { day, generatedAt: now.toISOString(), definition: SALES_DEFINITION, includedStatuses: INCLUDED_STATUSES, orderCount, cups, totalCents, cancelledOrders, cancelledCups, cancelledTotalCents, rows: lines, reconciliation, reconciliationDetails: { complete: !warnings.length, warnings, devices: devices.map(device => ({ ...device })) } };
}
