import type { GuestOrder, MenuItem, MenuResponse, OrderStatus, ReadyResponse, SalesOrder } from "./contracts";
import type { PublicAdapter } from "./adapters";

export const FIXTURE_TOKEN = "demo_only_7c2b6f088fd943cab0e52ac000000001";
export const FIXTURE_NOW = "2026-11-26T04:00:00.000Z";
export const fixtureMenu: MenuItem[] = [
  { id: "10000000-0000-4000-8000-000000000001", name: "White Christmas Latte", priceCents: 650, allowedMilk: ["Dairy", "Oat", "Soy"], allowedTemperatures: ["hot", "iced"], soldOut: false, active: true, revision: 2 },
  { id: "10000000-0000-4000-8000-000000000002", name: "Midnight Cold Brew", priceCents: 550, allowedMilk: ["None", "Dairy", "Oat"], allowedTemperatures: ["iced"], soldOut: false, active: true, revision: 1 },
  { id: "10000000-0000-4000-8000-000000000003", name: "Spiced Chocolate", priceCents: 600, allowedMilk: ["Dairy", "Oat"], allowedTemperatures: ["hot", "iced"], soldOut: true, active: true, revision: 1 },
  { id: "10000000-0000-4000-8000-000000000004", name: "Gingerbread Mocha", priceCents: 700, allowedMilk: ["Dairy", "Oat"], allowedTemperatures: ["hot"], soldOut: false, active: false, revision: 1 },
];
export function fixtureOrders(): (SalesOrder & { firstName: string })[] {
  const definitions: { number: string; name: string; status: OrderStatus; price: number; qty: number; day: string; created: string }[] = [
    { number: "1126-A-001", name: "Jamie", status: "queued", price: 600, qty: 2, day: "2026-11-26", created: "2026-11-26T02:00:00.000Z" },
    { number: "1126-A-002", name: "Alex", status: "making", price: 550, qty: 1, day: "2026-11-26", created: "2026-11-26T02:01:00.000Z" },
    { number: "1126-A-003", name: "Priya", status: "ready", price: 650, qty: 1, day: "2026-11-26", created: "2026-11-26T02:02:00.000Z" },
    { number: "1126-A-004", name: "Mei", status: "collected", price: 10, qty: 3, day: "2026-11-26", created: "2026-11-26T02:03:00.000Z" },
    { number: "1126-A-005", name: "Sam", status: "cancelled", price: 600, qty: 2, day: "2026-11-26", created: "2026-11-26T02:04:00.000Z" },
    { number: "1127-A-001", name: "Noor", status: "collected", price: 20, qty: 2, day: "2026-11-27", created: "2026-11-26T16:00:00.000Z" },
  ];
  return definitions.map((v, index) => ({ id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, publicNumber: v.number, firstName: v.name, eventDay: v.day, items: [{ menuItemId: fixtureMenu[index === 1 ? 1 : 0].id, nameSnapshot: index === 1 ? "Midnight Cold Brew" : index === 3 ? '=HYPERLINK("https://example.invalid","drink")' : "White Christmas Latte", unitPriceCentsSnapshot: v.price, quantity: v.qty, milk: index === 1 ? "None" : "Oat", temperature: index === 1 ? "iced" : "hot" }], totalCents: v.price * v.qty, status: v.status, revision: 1, createdAtDevice: v.created, receivedAtServer: v.created, updatedAtServer: v.created }));
}
export function asGuest(order: SalesOrder): GuestOrder {
  return { publicNumber: order.publicNumber, items: order.items.map(item => ({ nameSnapshot: item.nameSnapshot, quantity: item.quantity, milk: item.milk, temperature: item.temperature })), status: order.status, updatedAt: order.updatedAtServer };
}
/** Explicit test adapter only; production screens default to HTTP. Same interface, no implicit fallback. */
export function createMockPublicAdapter(initial = fixtureOrders()): PublicAdapter & { setStatus(index: number, status: OrderStatus): void; setOffline(value: boolean): void } {
  const orders = structuredClone(initial);
  let offline = false;
  const check = () => { if (offline) throw new TypeError("Network unavailable"); };
  return {
    async guest(token) { check(); if (token !== FIXTURE_TOKEN) { const { ApiError } = await import("./adapters"); throw new ApiError("NOT_FOUND", "Order unavailable.", 404); } return { order: asGuest(orders[0]), syncedAt: FIXTURE_NOW }; },
    async ready(): Promise<ReadyResponse> { check(); return { orders: orders.filter(o => o.status === "ready").map(o => ({ publicNumber: o.publicNumber, firstName: o.firstName })), syncedAt: FIXTURE_NOW }; },
    setStatus(index, status) { orders[index].status = status; orders[index].updatedAtServer = FIXTURE_NOW; },
    setOffline(value) { offline = value; },
  };
}
export function mockMenuResponse(): MenuResponse { return { items: structuredClone(fixtureMenu), revision: 2, syncedAt: FIXTURE_NOW }; }
