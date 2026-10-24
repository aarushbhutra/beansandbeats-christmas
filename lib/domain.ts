import type { OrderItem, OrderStatus } from "./contracts";
export function eventDay(date = new Date()): string {
 const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Singapore",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
 const get = (key: string) => parts.find(p => p.type === key)!.value;
 return `${get("year")}-${get("month")}-${get("day")}`;
}
export function totalCents(items: OrderItem[]): number {
 return items.reduce((sum, item) => {
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.unitPriceCentsSnapshot) || item.unitPriceCentsSnapshot < 0) throw new Error("Invalid quantity or price");
  const next = sum + item.quantity * item.unitPriceCentsSnapshot;
  if (!Number.isSafeInteger(next)) throw new Error("Total exceeds safe range");
  return next;
 }, 0);
}
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
 return ({queued:["making","cancelled"],making:["ready","cancelled"],ready:["collected","cancelled"],collected:[],cancelled:[]} as Record<OrderStatus,OrderStatus[]>)[from].includes(to);
}
export function publicNumber(day: string, prefix: string, sequence: number): string {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[A-Z]{1,4}$/.test(prefix) || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invalid ticket identity");
 return `${day.slice(5).replace("-", "")}-${prefix}-${String(sequence).padStart(3,"0")}`;
}
