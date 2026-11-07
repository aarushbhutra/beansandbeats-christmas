# Beans&Beats · Christmas Together 2026

Live app: pending · Demo video: pending · Technical summary PDF: pending

Browser coffee booth system for Christmas Together, Singapore, 26–29 November 2026. This branch contains the order/barista vertical slice. It is under development and has not been validated against a hosted Supabase project.

## Develop

Requires Node 22+ and pnpm 11.25.0 (pinned in `package.json`). Run `pnpm install --frozen-lockfile`, then `pnpm dev`. Production: `pnpm build`, then `pnpm start`. Checks: `pnpm typecheck` and `pnpm test`. No credentials are required for the scaffold pages. In the cloud workspace, add `--store-dir /workspace/.pnpm-store` to the install command because the home directory is not writable.

Copy `.env.example` to `.env.local` and supply values through your local editor or hosting environment settings. Never commit `.env.local`. Supabase URL and publishable key may be public; the `sb_secret_...` key is server-only. No real credentials or test account passwords are included.

## Backend setup

Create a Supabase project, then apply all SQL files in `supabase/migrations/` in filename order using its SQL editor or a configured Supabase CLI. The migrations have been exercised in embedded PostgreSQL, but not against a hosted project. It creates tables, constraints, immutable item snapshots, and default-deny row security.

Create barista and booth-lead users through Supabase Auth, then assign their UUIDs and roles in `staff_memberships` through an administrator session. Do not allow users to assign their own roles. `lib/server/auth.ts` verifies Bearer tokens and memberships server-side. Lead-only device registration endpoint and local activation helper are implemented but not connected to a hosted database. Staff sign-in, order/barista UI, transactional sync, and guest/ready read routes are now implemented. Never use a demo role selector as authorization.

## Ownership and handoff

Read [AGENTS.md](AGENTS.md), [shared agreement](plans/SHARED-CONTRACT.md), and [kickoff handoff](docs/OCTOBER-25-HANDOFF.md). Aarush owns infrastructure, order entry and barista queue; the friend owns guest/ready/menu/report modules. Do not start from an older scaffold before incorporating this branch.

## Deployment

Proposed target: a Node-compatible Next.js host such as Vercel, connected to Supabase. Set environment variables securely, build with `pnpm build`, and deploy over HTTPS. Hosting account/project access has not been provided; nothing has been deployed. No test logins exist yet. Create accounts in your own Supabase Auth project; never add passwords to source control.

## Daily rollover and reset (design)

Do not delete orders or reuse device prefixes. Before closing a day, reconcile every registered device's outbox, resolve conflicts and export the SGT day's report. Begin the new SGT event day while retaining history. Device storage loss requires fresh server registration with a new prefix. The full event reset/reconciliation workflow still needs device watermark and conflict-resolution support. Organizer retention/deletion policy is pending; a controlled personal-data purge must be designed separately from daily reset.

## Use the vertical slice

For a development project, optionally apply `supabase/seed.sql` to add the fictional menu and station. Create staff accounts in Supabase Auth and grant one `booth_lead` membership through SQL/admin access. Set the three `.env.local` variables and rebuild/restart. At `/orders`, sign in as lead, register one device with a unique prefix and the station UUID, and refresh the menu. Registration initializes local persistent storage. The same tablet can subsequently sign in with a barista account.

Save a drink with milk, temperature, quantity and first name. Its number, QR token, order and outbox operation are persisted atomically. `/barista` shows queued, making and ready orders. Foreground polling replays saved operations every five seconds while signed in and also on reconnect. The QR opens the integrated `/guest` screen. The public collection board is `/ready`. The API is `GET /api/guest/status` with a Bearer tracking token. `/api/ready` returns names/numbers only; `/api/menu` returns `{items}` and `/api/staff/orders?day=YYYY-MM-DD` returns `{orders}`. These read routes disable response caching.

`POST /api/sync` accepts one typed operation per request and returns `{results, serverRevision}`. The server supports createOrder, advanceOrder, cancelOrder and updateMenu. Lead-only updateMenu now uses the same atomic receipt and device-sequence transaction. Every server operation locks its device, validates its next sequence, and commits order changes and acknowledgement together. An embedded PostgreSQL test exercises the SQL; a simulated IndexedDB test exercises local transactions and reopening.

## Current limits

Guest/ready screens are integrated. Lead menu controls and reports now share staff sign-in through `/lead`. First-ever loads require connectivity. Production builds now cache the page shells and static assets; wait for “Offline pages ready on this device” before service. A cached registered tablet can save and progress a new order through collection offline. The outbox assigns expected revisions and replays operations in device sequence after reconnecting. Existing open tabs can save orders against cached menu data; stale-menu, revision and other server conflicts stop replay until a booth lead investigates. There is no automatic conflict reconciliation or safe discard/reset UI yet: preserve the tablet data and do not delete a blocked operation, because that creates a device-sequence gap. Do not use this version live at the event.

The IndexedDB database stores local names, operational data and guest tokens on the staff device. Use dedicated trusted tablets. Signing out stops server access but does not purge unsynced work; personal-data purge and retention controls remain pending. Samples are fictional and totals do not verify POS payments. Hosting and test accounts remain external prerequisites.

## Lead module integration

Apply `202610270001_lead_integration.sql` after the two earlier migrations. It adds an atomic menu compare-and-swap function, menu support to the existing sync transaction, and a consistent report snapshot function. Public and barista menu reads exclude inactive items; verified booth leads can see inactive entries. Lead PATCH, report JSON and CSV routes independently enforce server authorization.

Sign in at `/lead/menu` or `/lead/reports` using the same Supabase staff account as order entry. A lead must register the tablet before saving durable menu changes. Pending edits survive IndexedDB reopen and are preserved when refreshing the server menu; acknowledged edits advance the menu revision, not an order revision. Barista sessions cannot replay menu mutations. An offline edit on one tablet is not visible to other disconnected tablets.

Reports include all persisted orders for the chosen SGT event day and read their immutable item snapshots together with all registered devices in one database snapshot. Pending operation counts remain **unknown** until device watermark/heartbeat support is implemented. Consequently exports remain provisional; a recent server receipt alone does not establish full reconciliation. Recorded value is not proof of POS payment.

The root `pnpm test` runs the shared and Person 2 unit/integration suites. The separate `tools/person2-preview` project has its own dependencies and checks and is excluded from the production app's TypeScript project; its source tests were not replaced or disabled. Hosted Supabase and real-device acceptance remain outstanding.

## Offline tablet operation

Run `pnpm build` (also generates the build-specific `public/sw.js`), then `pnpm start`, using HTTPS on a deployed host. Service workers also work on localhost for testing. Offline page caching is intentionally disabled in `pnpm dev`. Open the app online and wait for **Offline pages ready on this device**; first-time use and staff/device registration still require connectivity. Use the Take orders / Preparation queue links for document navigation between cached staff pages.

The worker caches only seven known client-rendered page shells, the offline fallback, and same-origin Next.js static assets. It never caches API responses, Supabase traffic, Authorization requests, mutations or query/RSC responses. Staff names, QR tokens and unsynced operations remain in operational IndexedDB, separate from the worker cache. Guest/board snapshot behavior remains owned by their existing privacy-aware client storage. Do not move personalized server-rendered data into these cached HTML shells.

Orders can progress queued → making → ready → collected while offline. Each change is saved atomically with its device sequence; pending changes predict server revisions. On reconnect, the same operation IDs replay, acknowledgements update local revisions without regressing them, and a conflict stops the stream. Auth expiry leaves operations intact and requires signing in again. Web Locks serialize replay across supported browser tabs; database receipts provide server idempotency. Foreground requests have a 12-second deadline.

Updates wait until existing tabs close: sync first, then close all booth tabs and reopen. Browser storage eviction or manually clearing data can lose unsynced work; use dedicated tablets, keep their storage intact, and re-register with a new prefix after storage loss. Lead menu edits work in an already authenticated open tab; reloading its shell offline does not establish a new verified staff role. Conflict resolution and reporting device watermarks remain separate unfinished features.

Validation: `pnpm test` covers 33 local domain/database/IndexedDB cases. `pnpm build && pnpm test:e2e` runs two Chromium tests with actual network-disabled reloads, document navigation, order saving, lifecycle changes, persistent outbox and cache boundaries. Tests use fixture registration and embedded PostgreSQL, not a hosted Supabase session. For Linux cloud testing, Chromium defaults to `/usr/bin/chromium`; set `CHROMIUM_PATH` to your installed Chromium executable elsewhere. Browser test artifacts are ignored by Git.

### Supabase live acceptance still required

Supply `SUPABASE_SECRET_KEY` securely for this project's HTTPS destination, apply the three existing migrations, and create barista/lead users and memberships. The public URL/key alone do not enable privileged server routes. No new migration is required for offline operation. Once configured, register a real tablet, create orders online/offline, restore Wi-Fi, and confirm exactly one order and receipt per operation in the database. Check guest ready alerts, menu revisions and daily CSV against that data. Network access to the project must be allowed. Reports remain provisional until device freshness is implemented.

### Modern Supabase API keys

Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` in the browser and `SUPABASE_SECRET_KEY=sb_secret_...` on the server. The server client and readiness checks use the same secret variable. The legacy `SUPABASE_SERVICE_ROLE_KEY` environment name is no longer used. Secret keys still use the elevated Postgres `service_role` role and bypass RLS; do not change database grants from `service_role` to a made-up `secret` role. All app staff routes continue verifying the user's session and membership before privileged access. Never put the secret in a `NEXT_PUBLIC_` variable, committed file, client bundle or chat.

Cloud environment settings must be saved and applied to the running workspace before a process can read a newly added key. Vercel variables apply to Vercel deployments, not this workspace. Restart the app after configuration changes; rebuild if public variables changed. The secret key provides Data API/Auth admin access, not a Postgres connection string or a Supabase Management API token. Apply migrations through the SQL editor or a separately authenticated CLI.
