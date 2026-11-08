# Plan 1 — Aarush: order entry, barista queue, offline/sync infrastructure

Suggested assignment; swap names if needed. Read [the shared agreement](SHARED-CONTRACT.md). Own modules 1 and 2 plus the infrastructure that enables all six modules. This is the larger technical risk, so finish the sync contract early and avoid optional features.

## Your outputs

- Tablet order screen: drink, milk, hot/iced, first name, quantity, total, and unique public number.
- Barista queue: ordered tickets; one tap making, one tap ready, and collection/cancellation controls.
- Durable offline operation, backend/database, staff roles, guest/ready APIs, deployment.
- Setup/deployment/day-reset README and operational evidence.

## 25 October: unblock both developers

1. Scaffold the agreed Next.js/TypeScript app and install the selected PWA, IndexedDB, database/auth dependencies. Own package and lockfile edits.
2. Create lib/contracts.ts from the shared agreement; provide sample menu/order/sync objects.
3. Set up shared layout, basic components, registered device identity, barista/booth-lead roles, and secure environment configuration.
4. Commit the scaffold immediately. Give your friend the client hook shapes, mock fixtures, and route-to-handler interfaces; let them build independently.
5. Create migrations for menu, orders, immutable item price snapshots, sync operation receipts, devices, and staff membership. Use unique constraints and database transactions.

## 26–28 October: complete one vertical slice

- Build order entry with supported modifier choices, first-name-only input, total, disabled duplicate submit, and post-save per-order QR.
- Save order + outbox operation in one local IndexedDB transaction before confirming success.
- Persist device prefix and sequence; generate collision-resistant order/operation IDs and secure guest tokens.
- Implement idempotent server create and queue transitions with role/revision validation.
- Build barista queued/making/ready tabs or sections. Show pending-sync badges and clear conflicts.
- Expose minimal guest status and ready-board APIs so your friend can replace mocks.
- Deploy an early version. Create secure test barista and lead accounts; no service key in browser bundles.

## 29–31 October: integrate all six modules

- Wire your friend's menu/report handlers into shared route/auth wrappers.
- Connect guest QR → status → ready board; check item snapshots and totals.
- Provide shared durable submitOperation and sync status helpers for menu edits.
- Ensure every screen has a route and a real backend flow; check both test roles on deployed URLs.
- Merge fixes daily. Do not defer integration until the final week.

## 1–3 November: prove offline correctness

- Cache the app shell and menu and verify reopening previously visited tablet routes offline.
- Persist outbox across reload/browser restart; retry on startup, reconnect and foreground timer.
- Simulate lost acknowledgements and repeat operations; verify unique receipts and no duplicate orders.
- Exercise per-device ordering, stale revisions, two-device conflicts, invalid status transitions, and delayed offline orders.
- Expose actionable conflict resolution; keep failed operations visible until resolved.
- Test offline menu changes with your friend and document cross-device connectivity limits.
- Protect API and database access for guest, barista and booth-lead roles. Never rely on hiding buttons.

## 4–7 November: stabilize and hand over

- Validate phone/tablet compatibility with your friend, fix required-flow failures, and run a production build.
- Write README setup, secure variable names, deployment, test roles, daily rollover, exports, and recovery steps.
- Daily close: sync registered devices, resolve conflicts, export/reconcile CSV, then roll over SGT date without deleting records.
- Supply architecture and offline/retry/conflict details for your friend's one-page PDF.
- Prepare reliable demo data and support video recording; confirm final links/logins work from a clean browser.

## Done means

All shared offline, idempotency, persistence, access-control and reset gates pass. The deployed order/barista screens can survive a Wi-Fi drop and reconnect without losing or duplicating an order. Limitations are accurately disclosed in documentation and the demo.

## Boundaries and handoffs

Own shared infrastructure and API routes. Your friend owns guest/ready/menu/report screens and menu/report calculations. Notify them before changing shared contracts. If infrastructure slips, your friend can finish fixtures, report tests, docs and screen behavior while you resolve it; regroup before adding features.

Do not build payments, loyalty, SMS, or native apps. Do not promise cross-device real-time sync while disconnected.

## Vertical slice implementation status

Order entry, device counters, persistent QR tickets, staff sign-in, barista controls, durable outbox replay, transactional sync and guest/ready read APIs are implemented. Local tests use embedded PostgreSQL and simulated IndexedDB; production build is checked. Hosted Supabase validation, real browser persistence/phone tests, deployment and test logins remain outstanding until project access is supplied. See README for setup and limitations.

## Lead integration status

Menu/report handlers are wired to authenticated API routes and database functions. Lead pages share the staff session and an atomic, persistent menu outbox. The home page links all six modules. Shared tests include SQL role/revision/idempotency checks and menu refresh/reopen/acknowledgement checks; Person 2 unit tests run from the root command. Apply the third migration for hosted validation. Device watermark/heartbeat reporting, hosted tests and final event reconciliation remain pending.

## Offline reliability status

Production shell caching, network-disabled tablet reload and full queued-to-collected local chains are implemented. Server replay uses existing Supabase SQL functions; tests simulate an expired session and a response lost after commit and verify exactly-once order/receipt counts. Chromium checks confirm cached operational pages and persistent offline writes without API/Supabase response caching. Live Supabase validation, actionable conflict reconciliation, device freshness reporting, offline role restoration and target-device testing remain outstanding.
