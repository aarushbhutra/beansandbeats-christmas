/** Person 2 boundary types. Person 1 can satisfy these structurally from lib/contracts.ts. */
export const ORDER_STATUSES = ["queued", "making", "ready", "collected", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type StaffRole = "barista" | "booth-lead";
export interface ItemSnapshot {
  menuItemId: string;
  nameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  milk: string;
  temperature: string;
}
export interface SalesOrder {
  id: string;
  publicNumber: string;
  eventDay: string;
  items: readonly ItemSnapshot[];
  totalCents: number;
  status: OrderStatus;
  createdAtDevice: string;
  receivedAtServer: string;
  updatedAtServer: string;
  revision: number;
}
/** Deliberately excludes names, totals, internal IDs, device IDs and token material. */
export interface GuestOrder {
  publicNumber: string;
  items: readonly Pick<ItemSnapshot, "nameSnapshot" | "quantity" | "milk" | "temperature">[];
  status: OrderStatus;
  updatedAtServer: string;
}
export interface GuestResponse { order: GuestOrder; syncedAt: string }
export interface ReadyResponse {
  orders: readonly { publicNumber: string; firstName: string }[];
  syncedAt: string;
}
export interface MenuItem {
  id: string;
  name: string;
  priceCents: number;
  allowedMilk: readonly string[];
  allowedTemperatures: readonly string[];
  soldOut: boolean;
  active: boolean;
  revision: number;
}
export type MenuChange = Omit<MenuItem, "id" | "revision">;
export interface MenuResponse { items: readonly MenuItem[]; revision: number; syncedAt: string }
export interface DeviceFreshness {
  deviceId: string;
  prefix: string;
  pendingOperations: number | null;
  lastSeenAt: string | null;
}
export interface ReportLine {
  day: string;
  orderNumber: string;
  item: string;
  milk: string;
  temperature: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  status: OrderStatus;
}
export interface DailyReport {
  day: string;
  generatedAt: string;
  definition: string;
  includedStatuses: readonly OrderStatus[];
  orderCount: number;
  cups: number;
  totalCents: number;
  cancelledOrders: number;
  cancelledCups: number;
  cancelledTotalCents: number;
  lines: readonly ReportLine[];
  reconciliation: { complete: boolean; warnings: readonly string[]; devices: readonly DeviceFreshness[] };
}
export interface MenuOperation {
  kind: "updateMenu";
  entityId: string;
  expectedRevision: number;
  payload: MenuChange;
}
export interface SyncState {
  online: boolean;
  pendingCount: number;
  pendingEntityIds: readonly string[];
  conflicts: readonly { entityId: string; message: string }[];
  lastSyncedAt: string | null;
}
/** Resolves only after Person 1 has durably stored the operation. IDs/sequences belong to that helper. */
export type SubmitOperation = (operation: MenuOperation) => Promise<{ operationId: string; state: "pending" | "acknowledged" }>;
export interface StaffBridge {
  role: StaffRole | null;
  loading: boolean;
  menu: MenuResponse | null;
  sync: SyncState;
  submitOperation: SubmitOperation;
  refreshMenu: () => Promise<void>;
}
