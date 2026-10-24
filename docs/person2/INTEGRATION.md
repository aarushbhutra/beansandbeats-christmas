# Integration handoff to Person 1

No shared root package, layout, global styles, `lib/contracts.ts`, auth, `lib/offline`, API routes or database migrations have been created or changed. All CSS is scoped to Person 2's components. The nested preview package and lockfile can be excluded from the deployed app. The four real routes contain no fixture imports.

## 1. Reconcile boundary types

`lib/client/contracts.ts` records the shapes this implementation consumes. These are provisional structural boundary types, not a competing source of shared infrastructure. Replace them with compatible re-exports/mappings from your `lib/contracts.ts` once published. Cents and quantities are integers; eventDay is assigned at creation in Asia/Singapore. Tokens must contain at least 128 bits of cryptographically generated randomness; the client accepts URL-safe strings of 32–256 characters, but shape validation cannot establish entropy.

| Endpoint | Expected response |
| --- | --- |
| `GET /api/guest/status` | `{ order: { publicNumber, items: [{nameSnapshot, quantity, milk, temperature}], status, updatedAtServer }, syncedAt }` |
| `GET /api/ready` | `{ orders: [{firstName, publicNumber}], syncedAt }`; **only ready orders**, ordered by authoritative ready sequence. |
| `GET /api/menu` | `{ items: MenuItem[], revision, syncedAt }`; active items for public/barista; all items including inactive for verified booth leads. |
| `GET /api/lead/reports?day=YYYY-MM-DD` | `DailyReport` from the supplied handler. |
| `GET /api/lead/reports.csv?day=YYYY-MM-DD` | CSV attachment, same calculation; reconciliation field per row and `X-Reconciliation-Complete` header. |
| `PATCH /api/lead/menu/:id` | Body `{ expectedRevision, change: MenuChange }`; `{ item }` or structured error. |

Every successful envelope needs a current server `syncedAt` (reports: `generatedAt`). The poller rejects missing, invalid, >30-second-old or >5-second-future envelope times as stale; an unchanged order's `updatedAtServer` can legitimately be old. Use `Cache-Control: private, no-store` for guest/staff responses. Never cache guest API responses in the shared service worker, forward their headers to telemetry, or record URL fragments in analytics/error reporting.

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
  submitOperation, refreshMenu: menuHook.refresh,
}}>{children}</Person2StaffProvider>
```

The bridge deliberately delegates operation/device IDs and sequence assignment to your helper. The screen submits `{kind:'updateMenu', entityId, expectedRevision, payload: MenuChange}`. Resolve only **after** committing to IndexedDB. Return `{operationId, state:'pending'|'acknowledged'}`; persist pending edits across restarts; keep entity IDs listed until acknowledged; provide conflicts through shared sync state. Conflicted entities cannot be resubmitted until the shared sync panel explicitly resolves/discards their operation. A load-current-values action only refreshes the form; it does not silently discard a durable operation.

Pass an optimistic/cached menu from your hook if desired. Do not apply an optimistic revision as an acknowledged server revision. Pending entities are blocked from repeated editing; different items can still be queued offline. The menu handler edits **existing** items under the agreed PATCH contract. Creation/deletion needs an agreed new operation/route; the current UI uses activation/deactivation rather than inventing an unagreed create endpoint.

## 3. Wire the menu handlers

```ts
const menu = createMenuHandlers({ authenticate: verifiedSessionFromRequest, repository: menuRepository });
// /api/menu:                 GET(request) => menu.get(request)
// /api/lead/menu/[id]:       PATCH(request, ctx) => menu.patch(request, (await ctx.params).id)
```

`authenticate` returns `{id, role}` from your verified server session, or null. Apply your established same-origin/CSRF protection at cookie-authenticated mutation routes. Do not use the preview's role selector. `repository.read(includeInactive)` returns a `MenuResponse`; `repository.update(id, expectedRevision, change, actorId)` performs an atomic transaction with a revision predicate, increments revision and returns the updated item, or null on missing/revised items. Return null consistently to avoid guessing IDs. Reads are additionally filtered by the handler for non-leads.

Your transactional `/api/sync` dispatcher should call `validateMenuChange(payload)` and the same atomic repository logic for `updateMenu`, within **your** operation receipt transaction. The helper itself does not create a second receipt store, allocate numbers or touch order snapshots. Keep idempotency and revision checks in one database transaction; replay of an acknowledged operation must return its previous receipt before attempting another revision update.

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

The provisional sales definition includes queued/making/ready/collected orders and excludes cancellations. Screen labels say recorded value, not paid revenue. Confirm the definition and CSV/POS columns with the organiser before event use. Report calculation rejects duplicate orders, invalid quantities, unsafe integer totals and snapshot/total mismatches rather than returning misleading results. Device timestamps never move an order into a later sync day.

## 5. Guest QR, privacy and offline integration

Issue per-order links as `/guest#token=<secure-token>`. The browser exchanges the fragment via `Authorization: Bearer`; no query lookup or enumeration endpoint exists. Person 1 must generate the token securely, persist its hash server-side, register it idempotently on order sync and return the same minimal 404 behavior for nonexistent/expired tokens. No plaintext token logs. Counter QR links to `/guest` for instructions.

Guests cache their minimal order snapshot in sessionStorage under a SHA-256-derived token-specific key; the token itself stays in the fragment and memory. Cache/storage denial falls back to live reads. Public board session cache contains **only order numbers**; names live in memory and disappear from stale/offline views. Cached snapshots never trigger a fresh ready sound until validated by a live response. Collected orders disappear on the next successful board poll.

Your service worker owns offline app-shell reloads for these routes. These components cache data, not executable pages; first visits need connectivity. Reports keep their latest in-memory server snapshot while disconnected, with exports disabled on errors. Lead menu cache/durable writes come from your IndexedDB hooks. Polling is foreground/reconnect-aware, aborts on navigation, has 12-second request timeouts and never treats an old 200 response as current.

## 6. Final acceptance on the deployed app

Use [SUBMISSION.md](SUBMISSION.md) and [VALIDATION.md](VALIDATION.md). Deploy with HTTPS, authenticate both staff roles, scan a real QR on a real phone, verify audio muted/unmuted/locked, run cached page reloads offline, interrupt a committed sync response, repeat the operation ID and compare database/CSV counts. Supply actual architecture details before replacing the PDF's integration-pending notes. No production credentials belong in this branch.
