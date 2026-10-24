"use client";
/** A mock of the shared provider, confined to this isolated preview. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Person2StaffProvider } from "../../../lib/client/staff-bridge";
import { httpAdapters } from "../../../lib/client/adapters";
import type { MenuOperation, MenuResponse, StaffRole } from "../../../lib/client/contracts";

type Pending = MenuOperation & { operationId: string; conflict?: string };
const OUTBOX = "p2-preview-fixture-operations";
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [online, setOnline] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const busy = useRef(false);
  const operations = useRef<Pending[]>([]);
  const save = useCallback((next: Pending[]) => { localStorage.setItem(OUTBOX, JSON.stringify(next)); operations.current = next; setPending(next); }, []);
  const refreshMenu = useCallback(async () => { const current = await httpAdapters.menu(); setMenu(current); setLastSyncedAt(current.syncedAt); }, []);
  const drain = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    try {
      for (const operation of [...operations.current]) {
        if (operation.conflict) break;
        try {
          const response = await fetch("/api/preview/operation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation) });
          if (!response.ok) {
            if (response.status === 409) { const body = await response.json(); save(operations.current.map(p => p.operationId === operation.operationId ? { ...p, conflict: body.error.message } : p)); }
            break;
          }
          save(operations.current.filter(p => p.operationId !== operation.operationId));
        } catch { break; }
      }
      try { await refreshMenu(); } catch { /* Preserve previously loaded menu. */ }
    } finally { busy.current = false; }
  }, [refreshMenu, save]);
  useEffect(() => {
    setOnline(navigator.onLine);
    try { operations.current = JSON.parse(localStorage.getItem(OUTBOX) ?? "[]"); setPending(operations.current); } catch { /* Expose storage failures on attempted save. */ }
    void fetch("/api/preview/session").then(r => r.json()).then(body => setRole(body.actor?.role ?? null)).catch(() => setRole(null)).finally(() => setLoading(false));
    void drain();
    const reconnect = () => { setOnline(true); void drain(); };
    const disconnect = () => setOnline(false);
    window.addEventListener("online", reconnect); window.addEventListener("offline", disconnect);
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") void drain(); }, 5000);
    return () => { clearInterval(timer); window.removeEventListener("online", reconnect); window.removeEventListener("offline", disconnect); };
  }, [drain]);
  return <Person2StaffProvider value={{ role, loading, menu, sync: { online, pendingCount: pending.length, pendingEntityIds: pending.map(p => p.entityId), lastSyncedAt, conflicts: pending.filter(p => p.conflict).map(p => ({ entityId: p.entityId, message: p.conflict! })) }, refreshMenu, submitOperation: async operation => {
    if (role !== "booth_lead") throw new Error("Choose the booth-lead preview role first.");
    const operationId = crypto.randomUUID();
    save([...operations.current, { ...operation, operationId }]);
    // Returning pending proves that the screen doesn't equate local acceptance with server sync.
    void drain(); return { operationId, state: "pending" };
  } }}><div className="preview-banner">DEVELOPMENT PREVIEW · Sample menu & persisted fixtures · Staff auth / outbox are test doubles<a href="/">Preview controls ↗</a></div>{children}</Person2StaffProvider>;
}
