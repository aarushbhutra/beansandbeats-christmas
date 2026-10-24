# Integration handoff to Person 1

No shared root package, layout, global styles, `lib/contracts.ts`, auth, `lib/offline`, API routes or database migrations have been created or changed. All CSS is scoped to Person 2's components. The nested preview package and lockfile can be excluded from the deployed app. The four real routes contain no fixture imports.

## 1. Reconcile boundary types

`lib/client/contracts.ts` re-exports shared `Role`, `OrderStatus`, `OrderItem`, `MenuItem`, `GuestStatus`, `ReadyEntry` and `ReportRow` types from the merged `lib/contracts.ts`. Shared roles are `barista` / `booth_lead`; temperatures are `hot` / `iced`. The enriched daily report extends the shared report with cancellation, definition and device details while preserving `rows` and the `pending|unknown|complete` reconciliation enum. Only HTTP freshness envelopes and presentation state are additional local types. Tokens must contain at least 128 bits of cryptographic randomness; URL-safe strings of 32–256 characters pass the client shape check, which cannot establish entropy.

| Endpoint | Expected response |
| --- | --- |
| `GET /api/guest/status` | `{ order: { publicNumber, items: [{nameSnapshot, quantity, milk, temperature}], status, updatedAt }, syncedAt }` |
| `GET /api/ready` | `{ orders: [{firstName, publicNumber}], syncedAt }`; **only ready orders**, ordered by authoritative ready sequence. |
| `GET /api/menu` | `{ items: MenuItem[], revision, syncedAt }`; active items for public/barista; all items including inactive for verified booth leads. |
| `GET /api/lead/reports?day=YYYY-MM-DD` | `DailyReport` from the supplied handler. |
| `GET /api/lead/reports.csv?day=YYYY-MM-DD` | CSV attachment, same calculation; exact shared v1 columns in integer cents; provisional filename plus `X-Reconciliation-Complete` header. |
| `PATCH /api/lead/menu/:id` | Body `{ expectedRevision, change: MenuChange }`; `{ item }` or structured error. |

Enriched endpoints use a current server `syncedAt` (reports: `generatedAt`). The HTTP adapter also normalizes Person 1's published bare GuestStatus, ready `updatedAt` and menu `{items}` responses. For bare guest/menu reads, the response Date header is the freshness clock; a missing Date remains stale rather than inventing a timestamp. The poller rejects missing, invalid, >30-second-old or >5-second-future envelope times as stale; an unchanged guest order's `updatedAt` can legitimately be old. Use `Cache-Control: private, no-store` for guest/staff responses. Never cache guest API responses in the shared service worker, forward their headers to telemetry, or record URL fragments in analytics/error reporting.

## 2. Mount the shared provider on authenticated lead routes

Inside your existing lead auth layout, pass a **reactive** `StaffBridge` to `Person2StaffProvider`. `useStaffBridge()` does not authenticate users or initialize devices. Without the provider the pages fail closed and explain that the staff connection is missing. Server handlers also independently enforce the verified principal's role.

```tsx
<Person2StaffProvider value={{
  role: session.role, loading: session.loading,
  menu: menuHook.data,
  sync: {
    online: sync.online,
    pendingCount: sync.pendingCount,
    pendingEntityIds: sync.pendingOperations.map(op => op.entityId),
    conflicts: sync.conflicts.map(c => ({ entityId: c.entityId, message: c.message })),
    lastSyncedAt: sync.lastSyncedAt,
  },
  submitOperation: enqueueMenuIntent, refreshMenu: refreshAuthoritativeMenu,
  getAccessToken: async () => currentSupabaseSession?.access_token ?? null,
}}>{children}</Person2StaffProvider>
```

The current shared `submitOperation` requires a complete `SyncOperation` and returns `Promise<void>`; it cannot be passed directly as this bridge callback. `toSharedMenuOperation(intent, allocatedIdentity)` in `lib/client/shared-operation.ts` converts the payload to the exact shared operation. Implement `enqueueMenuIntent` in the shared infrastructure to allocate IDs/sequences and enqueue atomically, then return the UI receipt. The bridge deliberately delegates operation/device IDs and sequence assignment to that helper. The screen submits `{kind:'updateMenu', entityId, expectedRevision, payload: MenuChange}`. Resolve only **after** committing to IndexedDB. Return `{operationId, state:'pending'|'acknowledged'}`; persist pending edits across restarts; keep entity IDs listed until acknowledged; provide conflicts through shared sync state. Conflicted entities cannot be resubmitted until the shared sync panel explicitly resolves/discards their operation. A load-current-values action only refreshes the form; it does not silently discard a durable operation.

Pass an optimistic/cached menu from your hook if desired. Do not apply an optimistic revision as an acknowledged server revision. Pending entities are blocked from repeated editing; different items can still be queued offline. The menu handler edits **existing** items under the agreed PATCH contract. Creation/deletion needs an agreed new operation/route; the current UI uses activation/deactivation rather than inventing an unagreed create endpoint.

## 3. Wire the menu handlers

```ts
const menu = createMenuHandlers({ authenticate: verifiedSessionFromRequest, repository: menuRepository });
// /api/menu:                 GET(request) => menu.get(request)
// /api/lead/menu/[id]:       PATCH(request, ctx) => menu.patch(request, (await ctx.params).id)
```

`authenticateSharedStaff` in `lib/server/menu/shared-auth.ts` adapts your existing `requireStaff` verifier and its Bearer session to this signature. Supply `getAccessToken` in the provider so report/CSV requests use that same staff session. `authenticate` returns `{id, role}` from your verified server session, or null. Apply your established same-origin/CSRF protection at cookie-authenticated mutation routes. Do not use the preview's role selector. `repository.read(includeInactive)` returns a `MenuResponse`; `repository.update(id, expectedRevision, change, actorId)` performs an atomic transaction with a revision predicate, increments revision and returns the updated item, or null on missing/revised items. Return null consistently to avoid guessing IDs. Reads are additionally filtered by the handler for non-leads.

Your transactional `/api/sync` dispatcher receives the shared full `MenuItem` payload. Strip `id` and `revision`, call `validateMenuChange(change)` on the remaining editable fields, and apply the same atomic repository logic within **your** operation receipt transaction. Check that the payload ID matches `entityId`. The helper itself does not create a second receipt store, allocate numbers or touch order snapshots. Keep idempotency and revision checks in one database transaction; replay of an acknowledged operation must return its previous receipt before attempting another revision update.

## 4. Wire report handlers

```ts
const reports = createReportHandlers({
  authenticate: verifiedSessionFromRequest,
  readSnapshot: async day => repository.readConsistentOrdersAndAllDeviceWatermarks(day),
});
// /api/lead/reports:       GET => reports.json
// /api/lead/reports.csv:   GET => reports.csv
```

`readSnapshot(day)` returns `{orders: SalesOrder[], devices: DeviceFreshness[]}` from one consistent read. Read **only persisted acknowledged orders**, each once, with immutable line names/prices and the original eventDay. Return **all registered event devices**, including disconnected/unknown devices; never return an empty array to mean fully reconciled. `pendingOperations:null`, no heartbeat, age >60 seconds or known pending operations make totals provisional. Server receipts alone cannot establish that a disconnected tablet has no new local work.

The export uses the published v1 columns exactly: `eventDay,publicNumber,item,milk,temperature,quantity,unitPriceCents,lineTotalCents,status`. Cancelled rows remain present and excluded from totals by status. Provisional exports carry `-provisional.csv` in the filename and a false `X-Reconciliation-Complete` header. The provisional sales definition includes queued/making/ready/collected orders and excludes cancellations. Screen labels say recorded value, not paid revenue. Confirm the definition and CSV/POS columns with the organiser before event use. Report calculation rejects duplicate orders, invalid quantities, unsafe integer totals and snapshot/total mismatches rather than returning misleading results. Device timestamps never move an order into a later sync day.

## 5. Guest QR, privacy and offline integration

The published order-entry QR uses `/guest#<64-hex-token>`, which is supported. Named `/guest#token=<secure-token>` fragments are also supported. The browser exchanges the fragment via `Authorization: Bearer`; no query lookup or enumeration endpoint exists. Person 1 must generate the token securely, persist its hash server-side, register it idempotently on order sync and return the same minimal 404 behavior for nonexistent/expired tokens. No plaintext token logs. Counter QR links to `/guest` for instructions.

Guests cache their minimal order snapshot in sessionStorage under a SHA-256-derived token-specific key; the token itself stays in the fragment and memory. Cache/storage denial falls back to live reads. Public board session cache contains **only order numbers**; names live in memory and disappear from stale/offline views. Cached snapshots never trigger a fresh ready sound until validated by a live response. Collected orders disappear on the next successful board poll.

Your service worker owns offline app-shell reloads for these routes. These components cache data, not executable pages; first visits need connectivity. Reports keep their latest in-memory server snapshot while disconnected, with exports disabled on errors. Lead menu cache/durable writes come from your IndexedDB hooks. Polling is foreground/reconnect-aware, aborts on navigation, has 12-second request timeouts and never treats an old 200 response as current.

## 6. Final acceptance on the deployed app

Use [SUBMISSION.md](SUBMISSION.md) and [VALIDATION.md](VALIDATION.md). Deploy with HTTPS, authenticate both staff roles, scan a real QR on a real phone, verify audio muted/unmuted/locked, run cached page reloads offline, interrupt a committed sync response, repeat the operation ID and compare database/CSV counts. Supply actual architecture details before replacing the PDF's integration-pending notes. No production credentials belong in this branch.


## Exact shared LeadHandlers facade

`createLeadHandlers` in `lib/server/reports/lead-handlers.ts` implements the published `LeadHandlers` interface without modifying `lib/contracts.ts`. Inject `principal()` from the verified request, the same atomic menu repository and consistent report snapshot reader. Its `updateMenu(item, expectedRevision)`, `report(day)` and `csv(day)` enforce lead permissions and use the same validation/calculation as the HTTP handler factories. Tests compile against the shared interface and verify exact row names/CSV cent units.

The scaffold and subsequent order/barista implementation are merged through `24dfd0b`. Guest/ready HTTP adapters support its exact response/QR formats. `useMenu` still returns a cached array and `getSyncState` is a snapshot. The new StaffSession owns a private Supabase client and `syncTablet` provides order replay, but `updateMenu` is explicitly reserved for this handoff. Person 1 still needs to expose the reactive lead session/provider, add atomic menu intent allocation/acknowledgement, wire menu/report handlers and publish device freshness. Reuse StaffSession's client/session rather than creating another auth system.
