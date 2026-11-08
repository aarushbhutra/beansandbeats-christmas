/**
 * Shared types used by the server, the tablet sync engine and every screen.
 * Money is always integer cents. Event days are YYYY-MM-DD in Asia/Singapore.
 */

export type Role = "barista" | "lead";
export type OrderStatus = "queued" | "making" | "ready" | "collected" | "cancelled";
export type Temperature = "hot" | "iced";
export type MenuCategory = "coffee" | "seasonal" | "not-coffee";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: MenuCategory;
  priceCents: number;
  allowedMilk: string[];
  allowedTemperatures: Temperature[];
  /** Added to the unit price when served iced. */
  icedSurchargeCents: number;
  /** Per-milk price delta, e.g. { oat: 100 }. Milks not listed cost nothing extra. */
  milkSurcharges: Record<string, number>;
  soldOut: boolean;
  active: boolean;
  sortOrder: number;
  revision: number;
  updatedAt: string;
}

export interface OrderItem {
  menuItemId: string;
  menuRevision: number;
  nameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  milk: string;
  temperature: Temperature;
}

export type OrderFlag = "stale_menu" | "sold_out_at_sync";

export interface Order {
  id: string;
  publicNumber: string;
  shortNumber: string;
  deviceId: string;
  deviceSequence: number;
  eventDay: string;
  /** Null once the name has been purged after collection. */
  firstName: string | null;
  items: OrderItem[];
  totalCents: number;
  status: OrderStatus;
  revision: number;
  flags: OrderFlag[];
  createdAtDevice: string;
  receivedAtServer: string | null;
  updatedAtServer: string | null;
  makingAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface StaffProfile {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface Device {
  id: string;
  prefix: string;
  label: string;
  registeredAt: string;
  lastSeenAt: string | null;
  pendingOps: number | null;
  nextSequence: number;
  revokedAt: string | null;
  gapExpected: number | null;
}

/* ---------- Sync protocol v2 ---------- */

interface OperationBase {
  opId: string;
  deviceId: string;
  seq: number;
  entityId: string;
  createdAt: string;
}

export interface CreateOrderPayload {
  order: Pick<Order, "id" | "publicNumber" | "eventDay" | "firstName" | "items" | "totalCents" | "createdAtDevice">;
  trackingToken: string;
}

export type SyncOperation = OperationBase & (
  | { kind: "createOrder"; payload: CreateOrderPayload }
  | { kind: "advanceOrder"; payload: { to: "making" | "ready" | "collected" } }
  | { kind: "cancelOrder"; payload: { reason: string } }
);

export type SyncOutcome = "acknowledged" | "duplicate" | "conflict" | "rejected" | "gap";

export interface SyncResult {
  opId: string;
  seq: number;
  outcome: SyncOutcome;
  code?: string;
  message?: string;
  /** Server copy of the affected order after the operation, if it exists. */
  order?: Order;
  expectedSeq?: number;
}

export interface SyncRequest {
  deviceId: string;
  pending: number;
  ops: SyncOperation[];
  appVersion?: string;
}

export interface SyncResponse {
  results: SyncResult[];
  serverTime: string;
  nextSequence: number;
}

export interface FeedResponse {
  serverTime: string;
  day: string;
  orders: Order[];
  menu: MenuItem[];
  device: Device | null;
  feedSeq: number;
}

/* ---------- Public views ---------- */

export interface GuestStatus {
  publicNumber: string;
  /** The guest's own first name (token-protected). Null after the post-pickup purge. */
  firstName: string | null;
  shortNumber: string;
  status: OrderStatus;
  items: Pick<OrderItem, "nameSnapshot" | "quantity" | "milk" | "temperature">[];
  ahead: number;
  etaMinutes: number | null;
  createdAt: string;
  updatedAt: string | null;
  readyAt: string | null;
  serverTime: string;
}

export interface BoardEntry { shortNumber: string; publicNumber: string; firstName: string | null; readyAt: string | null }
export interface BoardResponse {
  ready: BoardEntry[];
  making: { shortNumber: string; firstName: string | null }[];
  queued: number;
  serverTime: string;
  day: string;
}

/* ---------- Reports ---------- */

export interface ReportRow {
  eventDay: string;
  publicNumber: string;
  orderedAt: string;
  item: string;
  milk: string;
  temperature: Temperature;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  status: OrderStatus;
  flags: string;
}

export interface DeviceReconciliation {
  deviceId: string;
  prefix: string;
  label: string;
  pendingOps: number | null;
  lastSeenAt: string | null;
  state: "clean" | "pending" | "unknown" | "revoked";
}

export interface DailyReport {
  day: string;
  generatedAt: string;
  definition: string;
  orders: number;
  cups: number;
  totalCents: number;
  averageOrderCents: number;
  cancelledOrders: number;
  cancelledCups: number;
  cancelledTotalCents: number;
  openOrders: number;
  flaggedOrders: number;
  prep: { medianSeconds: number | null; p90Seconds: number | null; samples: number };
  hourly: { hour: number; cups: number; totalCents: number }[];
  topItems: { name: string; cups: number; totalCents: number }[];
  milk: { name: string; cups: number }[];
  temperature: { hot: number; iced: number };
  devices: DeviceReconciliation[];
  reconciliation: { complete: boolean; warnings: string[] };
  rows: ReportRow[];
  closure: { closedAt: string; closedBy: string } | null;
}

export interface ApiErrorBody { error: { code: string; message: string } }
