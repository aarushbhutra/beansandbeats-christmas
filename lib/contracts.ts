export type Role = "barista" | "booth_lead";
export type OrderStatus = "queued" | "making" | "ready" | "collected" | "cancelled";
export type Temperature = "hot" | "iced";
export interface MenuItem { id: string; name: string; priceCents: number; allowedMilk: string[]; allowedTemperatures: Temperature[]; soldOut: boolean; active: boolean; revision: number }
export interface OrderItem { menuItemId: string; nameSnapshot: string; unitPriceCentsSnapshot: number; quantity: number; milk: string; temperature: Temperature }
export interface Order { id: string; publicNumber: string; stationId: string; deviceId: string; deviceSequence: number; eventDay: string; firstName: string; items: OrderItem[]; totalCents: number; status: OrderStatus; revision: number; createdAtDevice: string; receivedAtServer: string | null; updatedAtServer: string | null }
export interface Device { id: string; prefix: string; stationId: string; nextSequence: number; registeredAt: string }
type OperationBase = { operationId: string; deviceId: string; deviceSequence: number; entityId: string; expectedRevision: number };
export type SyncOperation = OperationBase & (
 | { kind: "createOrder"; payload: { order: Order; trackingToken: string } }
 | { kind: "advanceOrder"; payload: { status: "making" | "ready" | "collected" } }
 | { kind: "cancelOrder"; payload: { reason: string } }
 | { kind: "updateMenu"; payload: MenuItem });
export type SyncResult = { operationId: string; outcome: "acknowledged"; revision: number } | { operationId: string; outcome: "rejected" | "conflict"; code: string; message: string };
export interface SyncResponse { results: SyncResult[]; serverRevision: number }
export interface SyncState { pending: number; blocked: number; online: boolean }
export interface GuestStatus { publicNumber: string; items: Pick<OrderItem, "nameSnapshot" | "quantity" | "milk" | "temperature">[]; status: OrderStatus; updatedAt: string }
export interface ReadyEntry { firstName: string; publicNumber: string }
export interface ApiError { error: { code: string; message: string } }
export interface ReportRow { eventDay: string; publicNumber: string; item: string; milk: string; temperature: Temperature; quantity: number; unitPriceCents: number; lineTotalCents: number; status: OrderStatus }
export interface DailyReport { day: string; cups: number; totalCents: number; rows: ReportRow[]; reconciliation: "pending" | "unknown" | "complete" }
// Person 2 implements these handlers; Person 1 wires role checks and route validation.
export interface LeadHandlers { updateMenu(item: MenuItem, expectedRevision: number): Promise<MenuItem>; report(day: string): Promise<DailyReport>; csv(day: string): Promise<string> }
