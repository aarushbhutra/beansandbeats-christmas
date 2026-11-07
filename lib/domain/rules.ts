import type { OrderItem, OrderStatus } from "./types";

export const TIME_ZONE = "Asia/Singapore";
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Event day (YYYY-MM-DD) in Asia/Singapore. Singapore has no daylight saving. */
export function eventDay(date: Date = new Date()): string {
  return new Date(date.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hour of day (0-23) in Singapore. */
export function sgtHour(date: Date | string): number {
  return new Date(new Date(date).getTime() + SGT_OFFSET_MS).getUTCHours();
}

/** UTC instant at which the given SGT event day ends. */
export function endOfEventDay(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - SGT_OFFSET_MS + 24 * 60 * 60 * 1000);
}

export function isEventDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(cents / 100);
}

export function formatSgtTime(value: string | Date, seconds = false): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false,
  }).format(new Date(value));
}

export function formatDayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T00:00:00Z`)).toLowerCase();
}

/** Parse "6.5" / "6.50" / "6" into integer cents, rejecting floats with more than 2 decimals. */
export function parsePriceToCents(input: string): number | null {
  const value = input.trim().replace(/^\$/, "");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value)) return null;
  const [dollars, cents = ""] = value.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}

export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/* ---------- Lifecycle ---------- */

export const STATUS_RANK: Record<OrderStatus, number> = { queued: 0, making: 1, ready: 2, collected: 3, cancelled: 99 };
export const ACTIVE_STATUSES: OrderStatus[] = ["queued", "making", "ready"];

export type TransitionVerdict = "apply" | "noop" | "conflict";

/**
 * Forward-only lifecycle. Moving to a stage the order already passed is an idempotent no-op,
 * so two tablets advancing the same order never regress it. Terminal states never reopen.
 */
export function judgeTransition(current: OrderStatus, target: OrderStatus): TransitionVerdict {
  if (current === target) return "noop";
  if (current === "cancelled") return "conflict";
  if (target === "cancelled") return current === "collected" ? "conflict" : "apply";
  if (current === "collected") return "noop";
  return STATUS_RANK[target] > STATUS_RANK[current] ? "apply" : "noop";
}

export function nextStatus(status: OrderStatus): "making" | "ready" | "collected" | null {
  return status === "queued" ? "making" : status === "making" ? "ready" : status === "ready" ? "collected" : null;
}

/* ---------- Numbers ---------- */

export function publicNumber(day: string, prefix: string, ticket: number): string {
  if (!isEventDay(day) || !/^[A-Z]{1,2}$/.test(prefix) || !Number.isSafeInteger(ticket) || ticket < 1 || ticket > 9999) throw new Error("Invalid ticket identity");
  return `${day.slice(5, 7)}${day.slice(8, 10)}-${prefix}-${String(ticket).padStart(3, "0")}`;
}

export function shortNumber(publicNo: string): string {
  return publicNo.split("-").slice(1).join("-");
}

export function parsePublicNumber(value: string): { mmdd: string; prefix: string; ticket: number } | null {
  const match = /^(\d{4})-([A-Z]{1,2})-(\d{3,4})$/.exec(value);
  return match ? { mmdd: match[1], prefix: match[2], ticket: Number(match[3]) } : null;
}

/** Device prefixes: A..Z, then AA..ZZ. */
export function prefixForIndex(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < 26) return letters[index];
  const rest = index - 26;
  return letters[Math.floor(rest / 26) % 26] + letters[rest % 26];
}

/* ---------- Orders ---------- */

/** Unit price with modifiers: base + iced surcharge + milk surcharge. */
export function unitPriceCents(item: { priceCents: number; icedSurchargeCents: number; milkSurcharges: Record<string, number> }, milk: string, temperature: "hot" | "iced"): number {
  return item.priceCents + (temperature === "iced" ? item.icedSurchargeCents : 0) + (item.milkSurcharges[milk] ?? 0);
}

export function milkLabel(milk: string): string {
  return milk === "none" ? "black" : milk;
}

export function surchargeSummary(item: { icedSurchargeCents: number; milkSurcharges: Record<string, number>; allowedTemperatures: string[] }): string {
  const parts: string[] = [];
  if (item.icedSurchargeCents && item.allowedTemperatures.includes("iced")) parts.push(`iced +${formatMoney(item.icedSurchargeCents)}`);
  for (const [milk, cents] of Object.entries(item.milkSurcharges)) if (cents) parts.push(`${milk} +${formatMoney(cents)}`);
  return parts.join(" · ");
}

/** QR payload the guest shows at pickup; the bar tablet scans it. */
export const COLLECT_PREFIX = "BBCOLLECT:";
export function parseCollectCode(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  const full = /(?:BBCOLLECT:)?(\d{4}-[A-Z]{1,2}-\d{3,4})/.exec(value);
  if (full) return full[1];
  const short = /^([A-Z]{1,2})-?(\d{1,4})$/.exec(value);
  return short ? `${short[1]}-${short[2].padStart(3, "0")}` : null;
}

export function orderTotal(items: Pick<OrderItem, "quantity" | "unitPriceCentsSnapshot">[]): number {
  return items.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.unitPriceCentsSnapshot) || item.unitPriceCentsSnapshot < 0) throw new Error("Invalid quantity or price");
    const next = sum + item.quantity * item.unitPriceCentsSnapshot;
    if (!Number.isSafeInteger(next)) throw new Error("Total out of range");
    return next;
  }, 0);
}

export function cupCount(items: Pick<OrderItem, "quantity">[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/** First names only: trimmed, collapsed whitespace, no control characters, 1–40 chars. */
export function cleanFirstName(value: string): string | null {
  const cleaned = value.normalize("NFC").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length >= 1 && cleaned.length <= 40 ? cleaned : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const TRACKING_TOKEN = /^[A-Za-z0-9_-]{43}$/;
