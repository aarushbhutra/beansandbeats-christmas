/** Shared entities are re-exported; extra envelopes contain Person 2 presentation/freshness data. */
import type { DailyReport as SharedDailyReport, GuestStatus, MenuItem as SharedMenuItem, Order, OrderItem, OrderStatus as SharedOrderStatus, ReadyEntry, ReportRow, Role } from "../contracts";
export type { Temperature } from "../contracts";
export const ORDER_STATUSES = ["queued", "making", "ready", "collected", "cancelled"] as const;
export type OrderStatus = SharedOrderStatus;
export type StaffRole = Role;
export type ItemSnapshot = OrderItem;
export type SalesOrder = Pick<Order, "id" | "publicNumber" | "eventDay" | "totalCents" | "status" | "createdAtDevice" | "revision"> & {
  items: readonly ItemSnapshot[];
  receivedAtServer: string;
  updatedAtServer: string;
};
/** Deliberately excludes names, totals, internal IDs, device IDs and token material. */
export type GuestOrder = GuestStatus;
export interface GuestResponse { order: GuestOrder; syncedAt: string }
export interface ReadyResponse {
  orders: readonly ReadyEntry[];
  syncedAt: string;
}
export type MenuItem = SharedMenuItem;
export type MenuChange = Omit<MenuItem, "id" | "revision">;
export interface MenuResponse { items: readonly MenuItem[]; revision: number; syncedAt: string }
export interface DeviceFreshness {
  deviceId: string;
  prefix: string;
  pendingOperations: number | null;
  lastSeenAt: string | null;
}
export type ReportLine = ReportRow;
export interface DailyReport extends SharedDailyReport {
  generatedAt: string;
  definition: string;
  includedStatuses: readonly OrderStatus[];
  orderCount: number;
  cancelledOrders: number;
  cancelledCups: number;
  cancelledTotalCents: number;
  reconciliationDetails: { complete: boolean; warnings: readonly string[]; devices: readonly DeviceFreshness[] };
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
  /** Current Supabase staff session token; never a service-role credential. */
  getAccessToken?: () => Promise<string | null>;
}
