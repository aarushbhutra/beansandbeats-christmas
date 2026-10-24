# Beans&Beats · Christmas Together 2026

Live app: pending · Demo video: pending · Technical summary PDF: pending

Browser coffee booth system for Christmas Together, Singapore, 26–29 November 2026. This branch contains the **25 October foundation**, not a production ordering system.

## Develop

Requires Node 22+ and npm. Run `npm ci`, then `npm run dev`. Production: `npm run build`, then `npm start`. Checks: `npm run typecheck` and `npm test`. No credentials are required for the scaffold pages. In the cloud workspace, use `npm ci --cache /workspace/.npm-cache` because the default home cache is not writable.

Copy `.env.example` to `.env.local` and supply values through your local editor or hosting environment settings. Never commit `.env.local`. Supabase URL and publishable key may be public; the service-role key is server-only. No real credentials or test account passwords are included.

## Backend setup

Create a Supabase project, then apply `supabase/migrations/202610250001_foundation.sql` using its SQL editor or a configured Supabase CLI. The migration is for a fresh database and has not yet been executed against a hosted project. It creates tables, constraints, immutable item snapshots, and default-deny row security.

Create barista and booth-lead users through Supabase Auth, then assign their UUIDs and roles in `staff_memberships` through an administrator session. Do not allow users to assign their own roles. `lib/server/auth.ts` verifies Bearer tokens and memberships server-side. Lead-only device registration endpoint and local activation helper are implemented but not connected to a hosted database. Sign-in UI, database sync transactions and application API routes are the next milestone. Never use a demo role selector as authorization.

## Ownership and handoff

Read [AGENTS.md](AGENTS.md), [shared agreement](plans/SHARED-CONTRACT.md), and [kickoff handoff](docs/OCTOBER-25-HANDOFF.md). Aarush owns infrastructure, order entry and barista queue; the friend owns guest/ready/menu/report modules. Do not start from an older scaffold before incorporating this branch.

## Deployment

Proposed target: a Node-compatible Next.js host such as Vercel, connected to Supabase. Set environment variables securely, build with `npm run build`, and deploy over HTTPS. Hosting account/project access has not been provided; nothing has been deployed. No test logins exist yet.

## Daily rollover and reset (design)

Do not delete orders or reuse device prefixes. Before closing a day, reconcile every registered device's outbox, resolve conflicts and export the SGT day's report. Begin the new SGT event day while retaining history. Device storage loss requires fresh server registration with a new prefix. The executable reset/reconciliation workflow will be documented once sync and reports exist. Organizer retention/deletion policy is pending; a controlled personal-data purge must be designed separately from daily reset.

## Current limits

Local IndexedDB enqueue primitives are available; replay, cache service worker and conflict handling are not enabled. Public tracking, reports, sign-in and live queue behavior are not implemented. Sample data is fictional. Never interpret scaffold screens or recorded-order totals as verified POS payments.
