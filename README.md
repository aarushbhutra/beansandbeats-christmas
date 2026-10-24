# Beans&Beats · Christmas Together 2026

Live app: pending · Demo video: pending · Technical summary PDF: pending

Browser coffee booth system for Christmas Together, Singapore, 26–29 November 2026. This branch contains the order/barista vertical slice. It is under development and has not been validated against a hosted Supabase project.

## Develop

Requires Node 22+ and pnpm 11.25.0 (pinned in `package.json`). Run `pnpm install --frozen-lockfile`, then `pnpm dev`. Production: `pnpm build`, then `pnpm start`. Checks: `pnpm typecheck` and `pnpm test`. No credentials are required for the scaffold pages. In the cloud workspace, add `--store-dir /workspace/.pnpm-store` to the install command because the home directory is not writable.

Copy `.env.example` to `.env.local` and supply values through your local editor or hosting environment settings. Never commit `.env.local`. Supabase URL and publishable key may be public; the service-role key is server-only. No real credentials or test account passwords are included.

## Backend setup

Create a Supabase project, then apply both SQL files in `supabase/migrations/` in filename order using its SQL editor or a configured Supabase CLI. The migrations have been exercised in embedded PostgreSQL, but not against a hosted project. It creates tables, constraints, immutable item snapshots, and default-deny row security.

Create barista and booth-lead users through Supabase Auth, then assign their UUIDs and roles in `staff_memberships` through an administrator session. Do not allow users to assign their own roles. `lib/server/auth.ts` verifies Bearer tokens and memberships server-side. Lead-only device registration endpoint and local activation helper are implemented but not connected to a hosted database. Staff sign-in, order/barista UI, transactional sync, and guest/ready read routes are now implemented. Never use a demo role selector as authorization.

## Ownership and handoff

Read [AGENTS.md](AGENTS.md), [shared agreement](plans/SHARED-CONTRACT.md), and [kickoff handoff](docs/OCTOBER-25-HANDOFF.md). Aarush owns infrastructure, order entry and barista queue; the friend owns guest/ready/menu/report modules. Do not start from an older scaffold before incorporating this branch.

## Deployment

Proposed target: a Node-compatible Next.js host such as Vercel, connected to Supabase. Set environment variables securely, build with `pnpm build`, and deploy over HTTPS. Hosting account/project access has not been provided; nothing has been deployed. No test logins exist yet. Create accounts in your own Supabase Auth project; never add passwords to source control.

## Daily rollover and reset (design)

Do not delete orders or reuse device prefixes. Before closing a day, reconcile every registered device's outbox, resolve conflicts and export the SGT day's report. Begin the new SGT event day while retaining history. Device storage loss requires fresh server registration with a new prefix. The executable reset/reconciliation workflow will be documented once sync and reports exist. Organizer retention/deletion policy is pending; a controlled personal-data purge must be designed separately from daily reset.

## Use the vertical slice

For a development project, optionally apply `supabase/seed.sql` to add the fictional menu and station. Create staff accounts in Supabase Auth and grant one `booth_lead` membership through SQL/admin access. Set the three `.env.local` variables and rebuild/restart. At `/orders`, sign in as lead, register one device with a unique prefix and the station UUID, and refresh the menu. Registration initializes local persistent storage. The same tablet can subsequently sign in with a barista account.

Save a drink with milk, temperature, quantity and first name. Its number, QR token, order and outbox operation are persisted atomically. `/barista` shows queued, making and ready orders. Foreground polling replays saved operations every five seconds while signed in and also on reconnect. The QR opens the second contributor's future `/guest` page; that screen is not implemented here. The API is `GET /api/guest/status` with a Bearer tracking token. `/api/ready` returns names/numbers only; `/api/menu` returns `{items}` and `/api/staff/orders?day=YYYY-MM-DD` returns `{orders}`. These read routes disable response caching.

`POST /api/sync` accepts one typed operation per request and returns `{results, serverRevision}`. The current server supports createOrder, advanceOrder and cancelOrder. updateMenu remains reserved for integration with the second contributor. Every server operation locks its device, validates its next sequence, and commits order changes and acknowledgement together. An embedded PostgreSQL test exercises the SQL; a simulated IndexedDB test exercises local transactions and reopening.

## Current limits

Guest/ready screens, menu controls and reports remain the second contributor's work. First-ever loads require connectivity; no service worker is active yet, so app-shell offline reload is not available. A new local order must sync before its next change; one transition on a previously synced order may be saved offline, then must sync before another. Existing open tabs can save orders against cached menu data; stale-menu, revision and other server conflicts stop replay until a booth lead investigates. There is no automatic conflict reconciliation or safe discard/reset UI yet: preserve the tablet data and do not delete a blocked operation, because that creates a device-sequence gap. Do not use this version live at the event.

The IndexedDB database stores local names, operational data and guest tokens on the staff device. Use dedicated trusted tablets. Signing out stops server access but does not purge unsynced work; personal-data purge and retention controls remain pending. Samples are fictional and totals do not verify POS payments. Hosting and test accounts remain external prerequisites.
