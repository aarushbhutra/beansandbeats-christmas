# Beans&Beats: shared architecture and delivery agreement

Based on the hackathon brief supplied by Aarush. Team: Aarush + one friend. Suggested ownership: Aarush takes Plan 1, friend takes Plan 2; swap if your strengths suggest otherwise.

## Required outcome

Deliver all six modules: tablet order entry; barista queue; guest live status and ready alert; public ready board; editable menu/prices/sold-out flags; daily cups/revenue CSV. Payments remain exclusively on the organiser's POS.

Required submission:
1. Live deployed app with test barista and booth-lead logins.
2. Repository README with setup, deployment, and safe reset between days.
3. Three-minute video showing order entry → guest alert → ready board, including Wi-Fi loss and recovery.
4. One-page technical PDF covering architecture, offline/sync behavior, personal data/PDPA handling, and known limitations.

Put live app, video, and PDF links at the top of README; submit the repository link. The brief says submit before pitches start on 8 November even though the portal closes at 23:59 SGT: aim to finish on 7 November and confirm the pitch time.

## Stack and clear boundaries

Recommended starting point: one Next.js + TypeScript PWA, Supabase Postgres + Auth, IndexedDB through Dexie for local state and durable outbox. Use polling for live views initially; realtime subscriptions are optional after required behavior works. Service worker caches the app shell and static assets; IndexedDB stores operational data. A service worker alone does not make the system work offline.

Person 1 owns package.json/lockfile, app/layout.tsx, global styles, service worker/build configuration, lib/contracts.ts, lib/offline/, lib/server/, app/api/, database migrations, app/orders/, app/barista/, auth, deployment, and README integration.

Person 2 owns app/guest/, app/ready/, app/lead/menu/, app/lead/reports/, components for those screens, lib/client/ adapters and mock fixtures, report/menu server implementation under lib/server/menu/ and lib/server/reports/, documentation under docs/, video and PDF assembly. Person 1 wires the shared API route files to those implementations. Agree on the small handler interfaces at kickoff.

Person 1 builds common infrastructure; Person 2 starts with the required six-screen wireframes, shared types review, and exact contract fixtures while scaffolding happens. Person 1 publishes the scaffold immediately, then both use feature branches from the shared base. Avoid editing each other's files. Person 2 requests dependency additions and shared config edits through Person 1. Merge small vertical slices daily and both pull main before starting new work.

Use the existing cloud checkout; do not create additional worktrees unless requested. This repository currently has no implementation.

## Decisions to freeze together on 25 October

- Shared types, order lifecycle, offline queue semantics, role permissions, menu format, and CSV columns.
- Browser/tablet targets and hosting support for the chosen PWA stack.
- Booth has one primary order-entry tablet for the MVP. Additional terminals must be explicitly registered before use.
- Ask the organiser for actual menu, tablet/browser models, expected peak orders, CSV/POS reconciliation format, name-display consent/signage, retention expectations, and pitch time. Continue with labelled sample menu and CSV fixtures while waiting.
- Confirm both teammates can attend the dry run week of 16 November and be on call 26–29 November before promising live-operation support.

## Data and state contract

Use opaque UUIDs as internal IDs. Guest order access uses a high-entropy opaque tracking token; never expose sequential-number lookup as the only protection. Store and validate token hashes server-side. Do not log tokens.

Order:
- id, publicNumber, stationId, deviceId, deviceSequence, eventDay
- firstName (only; no phone in the MVP)
- items: menuItemId, nameSnapshot, unitPriceCentsSnapshot, quantity, milk, temperature
- totalCents, status, revision, createdAtDevice, receivedAtServer, updatedAtServer

Lifecycle: queued → making → ready → collected. Explicit staff cancellation is separate and requires a reason. Show ready orders until collected. No payment capture or claim of verified POS payment. Capture original price snapshots so later menu changes do not rewrite sales.

Menu:
- id, name, priceCents, allowedMilk, allowedTemperatures, soldOut, active, revision

Sync operation:
- operationId, deviceId, deviceSequence, entityId, kind, expectedRevision, payload

Device:
- registered device ID and a human-readable prefix, e.g. A.
- Public numbers use event-day + device prefix + durable local counter, e.g. 1126-A-001. Show the short number consistently across every screen.
- Initialize a device online. Losing local storage requires re-registration with a new prefix; do not silently reset and reuse its number range.

Store cents as integers. Derive event days in Asia/Singapore. Device timestamps inform display and troubleshooting; authoritative ordering uses server sequence for synced orders. Pending local orders remain in local sequence until acknowledged. Delayed orders enter the shared queue when synced; visibly label unsynced work and document this limitation.

## API and client contract v1

All errors: { error: { code, message } }. 401 unauthenticated, 403 wrong role, 409 conflict, 400 invalid input. Server enforces role checks, transitions, prices, and revisions. Agree on exact TypeScript request/response types at kickoff.

| API | Owner and purpose |
| --- | --- |
| GET /api/menu | Person 2 implementation, Person 1 route: active menu + revision |
| GET /api/staff/orders?day=YYYY-MM-DD | Person 1: authoritative queue, totals excluded from public views |
| POST /api/sync | Person 1: accept durable operations; return per-operation acknowledged/rejected/conflict results plus current server revision |
| GET /api/guest/status | Person 1: tracking token in Authorization header; minimal own-order number, items, status, last update |
| GET /api/ready | Person 1: only first names and public numbers for ready orders |
| PATCH /api/lead/menu/:id | Person 2 implementation, Person 1 route: lead-only revision-checked change; supports outbox via sync |
| GET /api/lead/reports?day=YYYY-MM-DD | Person 2 implementation, Person 1 route: synced daily totals + pending-data warning |
| GET /api/lead/reports.csv?day=YYYY-MM-DD | Person 2 implementation, Person 1 route: lead-only CSV from the same calculation |

POST /api/sync supports createOrder, advanceOrder, cancelOrder, updateMenu. Acknowledgements are idempotent by operationId; createOrder is also unique by order ID and public number. The guest token is created securely at order entry and registered with that order on sync; persist enough local data to render its QR offline. Person 1 supplies Person 2 with the guest token exchange/lookup helper rather than exposing server storage details.

Person 1 supplies useMenu(), useOrders(), submitOperation(), getSyncState(), and shared role/auth wrappers. Person 2 supplies guest/display adapters with identical mock and real interfaces. Freeze names and return shapes in lib/contracts.ts.

QR workflow: staff shows a per-order QR after saving; scanning opens that order's guest page. Also provide a counter QR to a landing page explaining how to obtain the per-order link. Confirm whether organisers expect a shared QR plus an order lookup flow; do not expose a public list of all guests to simplify lookup. Put tracking tokens in the URL fragment and exchange them client-side with the Authorization header; redact secrets from telemetry.

## Offline requirements and honest limits

Person 1 implements durable local writes, cached menu, app shell, outbox replay, idempotency, conflicts, retry, and visible connectivity/sync state. Person 2 consumes these helpers for menu controls and clearly labels stale guest/display/report data.

- Previously initialized tablets can reopen the cached app, create orders, and advance locally known orders offline. Save to IndexedDB before showing success.
- Local state and outbox survive refresh and tab/browser restart. Drain on launch, reconnect, and a foreground timer; do not rely on Background Sync availability on iOS.
- Handle lost responses after server commit by retrying the same operation ID.
- Preserve per-device operation order. Check revisions and valid transitions on the server. Show conflicts for staff resolution rather than silently overwriting or regressing statuses.
- An offline menu update is pending until synced. A disconnected tablet may sell an item recently marked sold out elsewhere; show menu staleness and require staff reconciliation.
- Independent offline devices cannot exchange new orders/status through the cloud. Guests away from the offline tablet see last synced status. Do not promise instantaneous remote alerts without connectivity. For Stage 1, demonstrate offline order entry and recovery, and discuss this live-event limitation with organisers.
- First-ever page loads require connectivity. Test cached reload separately from first use.
- Reports show server-synced records only, with an explicit reconciliation warning until all registered devices report no pending operations. Do not silently treat partial totals as complete.
- Guest ready alert works while the page is open: prominent ready state, optional sound enabled by a user tap, vibration where supported. Background/locked-phone notifications are not guaranteed; confirm whether the organiser requires push/SMS. Mobile is optional in the brief, so omit collection unless necessary.

## Sales, privacy, and reset rules

Provisional report: one row per drink line with SGT day, order number, item, milk, temperature, quantity, unit price, line total, status; summary cups and revenue. Include completed/fulfilled orders by an agreed definition; show cancelled orders separately and exclude their values from sold totals. Confirm whether queued/making/ready orders count as sales against the organiser's POS. Until confirmed, label totals as recorded orders, not verified payments. Test decimal accuracy, day boundaries, cancellations, and CSV formula escaping.

Collect first name only. Explain that it appears on the booth ready board; remove it promptly on collection. Limit staff access and anonymous response fields, prevent bulk guest lookup, configure database row permissions, avoid PII logs, and use HTTPS. Technical summary should describe actual controls and proposed retention; get organiser approval for the retention/deletion policy. Never claim legal certification.

Daily reset is a rollover to a new SGT event day, not deletion of history or counter reuse. Reconcile all device outboxes, export/review the day's CSV, and retain recoverable records according to the agreed retention policy. Person 1 documents this runbook; Person 2 validates the exports.

## Calendar (SGT)

| Dates | Joint milestone |
| --- | --- |
| 25 Oct | Read brief, freeze contract, scaffold, menu/CSV fixtures, six-screen wireframes |
| 26–28 Oct | Person 1: persisted online order flow + offline foundation; Person 2: four owned modules against mocks + menu/report logic |
| 29–31 Oct | Integrate all six real modules; deploy; demonstrate order → making → ready → collected |
| 1–3 Nov | Durable offline/reconnect, duplicate/conflict tests, mobile alerts, permissions, CSV/POS checks |
| 4–5 Nov | Fix required-flow bugs, tablet/phone checks, complete reset runbook, record demo rehearsal |
| 6–7 Nov | Freeze features, final video + one-page PDF, README links and test logins, final submission rehearsal |
| 8 Nov | Submit repo before pitches start; pitch. Do not rely on portal end time. |

If kickoff happens later, compress cosmetic polish first; preserve six modules, offline validation, and submission artifacts.

If selected: harden 9–13 Nov, dry run week of 16 Nov, live/on-call 26–29 Nov. Load targets and operational monitoring should be agreed before the dry run; 40,000 festival visitors is not a measured simultaneous user count.

## Joint acceptance gates

1. All six deployed modules work with correct barista versus lead permissions.
2. Two orders with modifiers and price snapshots progress through making, ready, collected; guest alert and board reflect synced state.
3. Warm-cache tablet goes offline, creates orders and advances one, refreshes/reopens with data retained, reconnects, and syncs exactly once.
4. Interrupt a response after server commit and retry: no duplicate order, number, or sales row.
5. Concurrent/stale updates cause visible conflict handling without status regression; menu changes do not alter old order prices.
6. Guest page on phone, tablet controls, and ready board show stale/offline state honestly; reconnect catches up.
7. SGT daily cups/totals and CSV match a known fixture including quantities, cancellations, and day rollover.
8. Guest cannot access staff/menu/report actions or another order without its token.
9. README reset procedure preserves history and reconciles devices; deployment can be reproduced.
10. Three-minute video includes Wi-Fi drop/recovery; live, video, and one-page PDF links appear at top of README.
