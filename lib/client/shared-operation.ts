import type { SyncOperation } from "../contracts";
import type { MenuOperation } from "./contracts";

type OperationIdentity = Pick<SyncOperation, "operationId" | "deviceId" | "deviceSequence">;
/** Pure translation only. Person 1 allocates identity/sequence and durably enqueues atomically. */
export function toSharedMenuOperation(intent: MenuOperation, identity: OperationIdentity): Extract<SyncOperation, { kind: "updateMenu" }> {
  return { ...identity, kind: "updateMenu", entityId: intent.entityId, expectedRevision: intent.expectedRevision, payload: { ...intent.payload, id: intent.entityId, revision: intent.expectedRevision } };
}
