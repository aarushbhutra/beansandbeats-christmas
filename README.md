# beans&beats · Christmas Together 2026

**Live app:** https://beansandbeats-christmas.vercel.app · **Demo video:** [Video](https://1drv.ms/v/c/d4b0547c464de8f1/IQDJYmrMbCL9Q5FC5RSrjuC4AdLOWClvITfocAC4uftVkVI?e=U2uoPi) **Technical Summary:** [PDF](https://drive.google.com/file/d/1rIfPe0Z43T_Q24c84gaoA2tCMPKJfNHm/view?usp=sharing)

**1. What we built**

We built an order-management web app for the beans&beats charity café at Christmas Together 2026. It connects counter staff, baristas, guests and team leads, helping them follow each order from entry to collection.

The app brings together six modules: order entry, a barista queue, guest order tracking, a public collection display, menu management and daily reporting. It also supports previously initialized tablets during Wi-Fi interruptions, an important requirement for a busy festival booth.

**2. How it works**

1. **Enter an order.** Counter staff select drinks, quantities and options such as iced preparation or oat milk. The app calculates the total and generates an order number and guest QR code. Payment takes place separately through the organiser’s POS.

2. **Save locally first.** The tablet saves the order and its pending changes in IndexedDB before confirming success. A service worker caches the app’s pages so previously initialized tablets can continue operating offline.

3. **Synchronize safely.** When connected, tablets send pending changes to the server in sequence. Unique operation identifiers prevent retries from creating duplicate orders. Conflicting changes are flagged for review, while order statuses cannot move backwards.

4. **Prepare and collect.** Baristas advance orders through queued, making, ready and collected. Guests scan their order QR to view progress on their phones. When ready, the guest page provides visual alerts, supported vibration and optional sound. Staff scan a pickup QR to locate the order and confirm collection.

5. **Manage and report.** Leads can change prices, mark drinks sold out, manage staff and tablets, review synchronization issues and export daily reports. Orders preserve their original prices even after menu changes. Reports remain provisional while outstanding orders or unsynchronized tablets need attention.

We used Next.js, React and TypeScript for the application, Dexie for tablet storage, PostgreSQL hosted on Neon for shared data, and Vercel for hosting. Server-Sent Events deliver live updates, while QR generation and scanning connect the counter, guest and pickup workflows.

The system uses menu data, drink selections, quantities, first names, order statuses and timestamps. It does not request guest phone numbers or email addresses. No AI model is required during operation; pricing, synchronization and order handling follow explicit rules.

**3. Results**

We delivered all **six core modules** in one deployed application, with hosting and database infrastructure located in Singapore.

The latest merged implementation records:

- **17 passing unit and integration tests**, covering order progression, duplicate prevention, conflicting updates, pricing, reporting, authentication and data reset.
- **Two browser tests**, covering offline order persistence and synchronization, plus access restrictions.
- Successful offline recovery in the tested scenario: an order survived page reloads and synchronized as **one server order** after reconnection.
- A guest ready alert arriving approximately **0.2 seconds** after the barista’s action in one documented live smoke test. This is an individual observation, not an average or performance guarantee.

The festival is scheduled for **26–29 November 2026**, so event sales, customer adoption and time savings have not yet been measured.

**4. Limitations and next steps**

Offline tablets cannot see changes that other devices have not synchronized. Guests also receive only the latest synchronized status, and alerts require their tracking page to remain open. Payment totals represent recorded orders rather than verified payments.

Our next steps are to run a realistic booth rehearsal, confirm the final menu and data-retention policy, test actual event devices, and measure order-entry time, preparation time, synchronization failures and pickup delays.

The order system for the beans&beats charity café at Christmas Together, Singapore's largest indoor Christmas festival (26–29 November 2026). All six modules run in one installable web app. The design follows [beansnbeats.com](https://beansnbeats.com):

- White canvas and `#1d1b1b` ink, in a Helvetica-style grotesk (the site uses Alte Haas Grotesk).
- Bold lowercase headings and black full-width section bars.
- Black square buttons and 1px-bordered inputs.
- A black footer and beans&beats' own logo and photography.
- Orange only as the active-navigation underline, exactly as on the site.

The guest page and ready board follow the organiser's monochrome mockups.

| # | Module | Route | Who uses it |
|---|---|---|---|
| 01 | Order entry (tablet POS, multi-drink tickets, per-order QR) | `/orders` | barista / lead |
| 02 | Bar queue (queued → on the decks → the drop) + camera **pickup scan** of the guest's QR → collected | `/barista` | barista / lead |
| 03 | Guest live status + ready alert (flash, vibration, optional chime) + pickup QR | `/guest#<token>` | guest phone |
| 04 | Public ready board (TV) | `/ready` | anyone |
| 05 | Menu, prices, iced/milk surcharges, sold-out flags | `/lead/menu` | lead |
| 06 | Daily cups/value report, CSV, day close-out | `/lead/reports` | lead |

**Counter flow (confirmed with the organiser):**
1. The guest orders at the counter and the barista keys the drink into `/orders`.
2. The POS person keys in the total shown on the ticket. Payment is PayNow or card only, on the organiser's POS.
3. The guest scans the QR on the tablet screen; there is no paper receipt.
4. When the drink is ready, the guest page shows a pickup QR. The bar tablet's camera scans it (`scan pickup`), and one tap marks it collected.

**Menu:** the database seeds Aden's WIP menu: espresso $3, americano $6, latte $8, flat white $8, pour-over $10. Iced is +$1 and oat milk is +$1. Black drinks have no milk choice. Surcharges are stored per menu revision, so old orders stay verifiable after price changes.

**Full manual + device test plan:** [docs/TESTING.md](docs/TESTING.md).

Leads also get `/lead` (live dashboard), `/lead/devices` (tablet registration, sync health, conflicts) and `/lead/team` (staff accounts). Payments stay on the organiser's POS: totals are recorded orders, not verified payments.

## Architecture

```
 tablet (Next.js PWA)                         server (Next.js route handlers, Node)          Postgres (schema "bb")
 ┌──────────────────────────────┐   POST /api/sync (batched, ordered, idempotent)   ┌────────────────────┐
 │ IndexedDB (Dexie)            │ ───────────────────────────────────────────────▶ │ orders, items      │
 │  orders · outbox · tickets   │   GET /api/staff/feed (authoritative snapshot)    │ sync_receipts      │
 │  menu · issues · meta        │ ◀─────────────────────────────────────────────── │ menu + revisions   │
 │ service worker: app shell    │   GET /api/staff/live  (SSE "something changed")  │ devices, staff     │
 └──────────────────────────────┘ ◀─────────────────────────────────────────────── │ feed_state (seq)   │
 guest phone ── GET /api/guest/live (SSE, token in Authorization header) ─────────▶ │ order_events, audit│
 ready board ── GET /api/board/live (SSE, numbers + first names of ready orders) ──▶ └────────────────────┘
```

- **Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Motion, Dexie (IndexedDB), Zod, the `postgres` driver and jsQR (camera pickup scanning). Locally, PGlite (embedded Postgres) runs the same SQL with zero setup.
- **Storage:** with `DATABASE_URL` set, the app uses any Postgres 14+ (Neon, Supabase, RDS). Without it, it uses PGlite in `.data/pglite`. On a serverless host without `DATABASE_URL` it falls back to throwaway `/tmp` storage and shows a red "demo storage" warning to leads. Migrations run automatically on first request under an advisory lock (`lib/server/migrations.ts`). All tables live in the `bb` schema, so they never collide with existing tables in a shared database.
- **Auth:** staff accounts in `bb.staff`, scrypt password hashes, random 256-bit session tokens stored as SHA-256 in `bb.sessions`, delivered as an `HttpOnly; SameSite=Lax; Secure` cookie (16 h). Mutations check `Origin`. Login is rate-limited per username and per IP (8 failures / 10 min). Roles: `barista`, `lead`; every route checks the role on the server.
- **Live updates:** writers bump `bb.feed_state.seq` inside their transaction. One poller per server instance (1 s) fans out to every open Server-Sent-Events stream. Streams recycle every ~50 s; clients reconnect with backoff and also poll as a safety net.

### Sync protocol (the important part)

1. **Durable first.** Creating or advancing an order is one IndexedDB transaction: order row, guest token, outbox operation and the device's sequence counter. The UI says "saved" only after commit.
2. **Per-tablet numbering.** A lead registers each tablet once, online. It gets a letter (`A`, `B`, … `AA`). Order numbers are `MMDD-A-001`, counted per tablet per SGT day, so offline tablets never clash. The short form `A-001` is shown everywhere.
3. **Ordered, idempotent replay.** Operations carry `opId` and a per-device `seq`. The server processes each in its own transaction under a device row lock. It writes a receipt, then advances `next_sequence`. A retried `opId` returns the original verdict (`duplicate`), so lost acknowledgements never double-count.
4. **Conflicts never block the queue.** A refused change (for example, cancelling an already-collected order) is recorded as a `conflict` receipt and in `bb.sync_issues`. It consumes its sequence, and later changes keep flowing. Tablets show it in the sync drawer; leads see it under *tablets & sync*.
5. **Forward-only lifecycle.** `queued → making → ready → collected` (`cancelled` from any open state). Moving to a stage the order already passed is a no-op, so racing tablets can't regress a status. Terminal states never reopen.
6. **Offline sales against an old menu.** Every menu edit is snapshotted in `bb.menu_revisions`. An order is accepted if its items match *some* revision (the price the guest paid at the POS), and flagged `stale_menu` / `sold_out_at_sync` for review. Items matching no revision are rejected as tampered.
7. **Gaps.** If a tablet lost local operations, the server reports a `gap` and pauses that tablet. A lead can explicitly *skip gap* on `/lead/devices`.
8. **Reconciliation.** Each sync reports the tablet's remaining outbox size. A day's report is *provisional* until every active tablet has reported an empty outbox recently (or after the day ended) and every order is collected or cancelled.

## Run it locally

Requires Node 22+ and pnpm 11.25.0 (pinned in `package.json`; `npx pnpm@11.25.0 …` works if pnpm isn't installed).

```bash
pnpm install --frozen-lockfile
pnpm setup:local      # writes .env.local with random first-run passwords and prints them
pnpm dev              # http://localhost:3000
```

Sign in at `/login` as `lead` with the printed password. Go to **lead → tablets & sync → register**, then take orders at `/orders`. Open `/barista`, `/ready` and the guest QR in other windows. The sample menu is fictional; replace it under **lead → menu**.

The offline service worker is generated only in production builds. Real devices need **HTTPS** for the camera scanner and the service worker; use a Vercel deploy or a `cloudflared` tunnel (see docs/TESTING.md):

```bash
pnpm build && pnpm start
```

## Checks

| Command | What it proves |
|---|---|
| `pnpm typecheck` | TypeScript, whole project |
| `pnpm test` | 16 tests on real SQL (in-memory PGlite): full lifecycle with guest/board views, lost-ack replay, conflicts consuming sequences, two-tablet races without regression, stale-menu acceptance + flags, gaps + lead skip, revoked tablets, report totals/cancellations/reconciliation, name purge, login + rate limit, SGT day rollover, CSV formula escaping, iced/oat surcharge pricing, pickup-code parsing |
| `TEST_DATABASE_URL=postgres://… DATABASE_POOL_MAX=1 pnpm test` | The same suite through the production `postgres` driver against a real Postgres. It drops and recreates the `bb` schema, so never point it at production. |
| `PLAYWRIGHT_BASE_URL=https://… E2E_LEAD_PASSWORD=… E2E_BARISTA_PASSWORD=… pnpm test:e2e` | The browser suite against a deployed URL. It registers one test tablet; clear it afterwards with **lead → tablets → reset test data**. |
| `pnpm build && pnpm test:e2e` | Chromium against a production server: a warm tablet goes offline, reloads from the cached shell, takes an order, advances it, reloads again with data intact, reconnects and syncs **exactly once**. It also checks barista vs lead vs anonymous access. Set `CHROMIUM_PATH` to use a system Chromium. |

## Current deployment

- **Hosting:** Vercel project `clipcontext/beansandbeats-christmas`. Functions are pinned to `sin1` (Singapore).
- **Database:** Neon Postgres in Singapore, connected through the Vercel Marketplace (sets `DATABASE_URL`).
- **Deploying:** GitHub isn't connected, so deploy with `npx vercel@latest deploy --prod` from a clean checkout. `.vercelignore` keeps local data, `.env*` files and tests out of the upload.
- **Health check:** `GET /api/health` should report `"storage":"postgres"`.

## Deploy (Vercel + Postgres)

1. Create a Postgres database. On Vercel: **Storage → Marketplace → Neon**, which sets `DATABASE_URL` automatically. A Supabase database also works: use its *connection pooling* URI.
2. Set these environment variables for Production:
   - `DATABASE_URL`
   - `BOOTSTRAP_LEAD_USERNAME` / `BOOTSTRAP_LEAD_PASSWORD`
   - `BOOTSTRAP_BARISTA_USERNAME` / `BOOTSTRAP_BARISTA_PASSWORD`: used once, only while the staff table is empty. Minimum 8 characters.
   - `CRON_SECRET`: protects the daily name purge in `vercel.json`.
   - optional: `NAME_RETENTION_MINUTES` (default 15), `SEED_SAMPLE_MENU=false`.
3. Deploy. `vercel.json` installs with the frozen lockfile and runs `pnpm build`, which also generates `public/sw.js`.
4. Open `/api/health`. It should report `"storage":"postgres"`. Sign in as the lead, then change the bootstrap passwords under **lead → team** or create named accounts.

**Test logins for judges:** create a `barista` and a `lead` account on the deployed app. Share the credentials in the submission form, never in this repository.

## Daily rollover and reset runbook

Event days are SGT (`Asia/Singapore`). Nothing is deleted at rollover, and device letters and order numbers are never reused.

1. **Before closing:** bring every booth tablet online and open it until its sync pill reads `synced`. Collect or cancel anything left on the bar queue.
2. **Lead → reports:** check that the banner reads *reconciled*. Any warning names the tablet or order to fix.
3. **Download the CSV.** Reconcile cups and totals with the organiser's POS. Cancelled rows are listed and excluded. Flagged rows were sold against an old menu.
4. **Close the day.** This records who closed it, the totals and the open warnings (if you acknowledge them) in `bb.day_closures`. A late sync still appears in the report; re-close to update the record.
5. **Next day:** at 00:00 SGT, tablets start numbering from `-001` under the new date. Nothing else is needed.

**After test runs and the dry run, before 26 Nov:** use **lead → tablets → reset test data** (type `reset`). It deletes orders, tablet registrations and sync history, and keeps staff accounts and the menu; tablet letters start from A again. Other tablets show a "clear this tablet" banner; clear them and re-register. **For the live event, set `DISABLE_DATA_RESET=true`** in Vercel and redeploy, so nobody can wipe event data.
6. **Lost or wiped tablet:** retire it in **tablets & sync** (its letter is never reused) and register the replacement (it gets a new letter). Never copy IndexedDB between devices.

## Privacy and data handling (PDPA-minded, not a legal certification)

- **First name only.** No phone or email. Names are shown on the ready board and to staff. They are deleted (`first_name = null`) 15 minutes after collection or cancellation, and all names from previous days are deleted. This runs on every sync (at most once a minute) and in a daily cron.
- **Guest links** carry a 256-bit random token in the URL **fragment**, which is never sent in requests or logs. Only the SHA-256 hash is stored. The page sends the token in an `Authorization` header. Guest responses contain number, drinks, status, queue position and ETA only: no names, totals or internal IDs. Pages send `Referrer-Policy: no-referrer`.
- **Board:** first names only while an order is ready. If its feed goes stale, it hides names ("check at counter"). Only numbers are cached in `sessionStorage`.
- **Tablets** keep names, tokens and unsynced work in IndexedDB until synced and the day rolls over. Use dedicated booth tablets. The service worker never caches API responses or anything personal.
- **CSV exports** contain no names or tokens. Text fields are quoted and formula-escaped.
- **Audit log** (`bb.audit_log`) records sign-ins, menu edits, device and staff changes, exports and day closures. It never records passwords or tokens.
- The retention periods above are proposals. Confirm them with the organiser.

## Honest limits

- First-ever load of each page needs a connection. Warm tablets reopen offline from the service worker; the e2e test covers this.
- Offline tablets can't see each other's new orders. Guests away from the booth see the last synced status. Alerts need the guest's page open; there is no SMS or push.
- Two offline tablets may both sell an item that was marked sold out elsewhere. The server accepts the sale at the price shown and flags it for review.
- Live streams poll the database once a second per server instance. That is fine for a booth, but it is not tuned for festival-scale public traffic. The board and guest pages also poll every 12–15 s as a fallback.
- Verified: unit/integration tests on PGlite, the Chromium e2e test, and an end-to-end API smoke run against a local production server. **Not yet verified:** a hosted Postgres deployment, real iPad/Android hardware, and real-venue Wi-Fi.

## Repository map

```
app/                 pages (/, /login, /orders, /barista, /guest, /ready, /lead/*) and API route handlers
components/brand     logo, vinyl, equaliser, marquee, snow
components/staff     staff shell, sync pill + drawer, login form
components/ui        modal, toasts, switch, stepper, notices, stats
lib/domain           shared types, lifecycle/number/money rules, report calculation, CSV
lib/server           db (Postgres/PGlite), migrations, auth, sync engine, live bus, lead services, maintenance
lib/client           IndexedDB schema, durable outbox, sync engine, SSE client, hooks
scripts              service-worker template + generator, local setup
tests/unit, tests/e2e
```

`plans/` and `docs/person2/` hold the original hackathon plans and the earlier handoff material. This rewrite supersedes their architecture: see the note at the top of `plans/SHARED-CONTRACT.md`.
