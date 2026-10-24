# 25 October handoff

## Established foundation

- Next.js App Router + TypeScript, pnpm lockfile (pnpm 11.25.0), Dexie, Supabase clients and server-only auth boundary.
- Shared contract v1 in `lib/contracts.ts`; core SGT date, amount and lifecycle rules in `lib/domain.ts`.
- Fictional typed menu/order/sync fixtures in `lib/fixtures.ts`.
- IndexedDB stores and atomic create-order/outbox enqueue in `lib/offline/`. Hooks return arrays (empty until data is cached); `submitOperation` returns only after the local transaction commits. `getSyncState` is a snapshot, not a live subscription.
- Initial SQL migration with deny-by-default data access. Not applied to a real project yet.

## Friend: start independently

Start from this scaffold, then create your feature branch. Import shared types and fixtures; keep mocks explicit. Build your `app/guest`, `app/ready`, `app/lead/menu`, `app/lead/reports` pages. Implement `LeadHandlers` for menu and reports under your owned directories; Aarush wires authenticated routes. See the shared plan for ownership.

Wireframes (drafts for review):

| Screen | Primary layout |
| --- | --- |
| Order entry | Connectivity + pending count → first name → drink/modifier/quantity controls → total → Save → number and per-order QR |
| Barista | Connectivity + pending count → ordered queued tickets → Making action → making tickets → Ready action → collected confirmation |
| Guest | Large order number → drink summary → queued/making/ready state → enable sound → last synced timestamp |
| Ready board | Booth title → large first names + numbers ready for collection → freshness indicator |
| Menu controls | Lead identity → item list → price/milk/temperature editor + sold-out toggle → pending/conflict feedback |
| Daily report | SGT day → reconciliation warning → cups + recorded totals → rows → CSV export |

## Interface decisions (v1 proposal, teammate review pending)

Use the shared plan's lifecycle and endpoints; TypeScript provides exact request and fixture shapes. Guest status carries no first name or internal ID. Ready board carries first name + public number only. Sync operation sequence counts every operation; an order's deviceSequence records its create operation sequence. Device prefix and monotonically increasing sequence are server-registered before offline use; lead-only online registration is implemented at POST /api/staff/devices with a local activation helper; runtime validation awaits Supabase configuration.

CSV column order: eventDay, publicNumber, item, milk, temperature, quantity, unitPriceCents, lineTotalCents, status. Initial report fixture: sampleOrder represents 2 cups, 1100 cents of recorded orders; cancelled value excluded from the included-total calculation. Organizer-approved sales inclusion/POS format remains pending. Units are integer cents throughout.

Next work: persist counters atomically with device/outbox changes; validate device registration and implement transactional server sync RPC; add cache service worker and ordered replay with auth-expiry and conflict handling. The current enqueue helper is not a complete offline system and should not be used as a production order entry path yet.

## External decisions still needed

- Organizer menu, tablet/browser models, peak order rate, POS CSV format, display notice and retention policy, exact pitch time.
- Team availability for week of 16 November and 26–29 November.
- Supabase project credentials and deployment account/project access, entered securely outside chat/source control.
- Confirm stack/contracts and wireframes together. These are proposed defaults; neither teammate agreement nor organizer approval has been assumed. No messages have been sent to the organizer.

## Day-one verification

Domain checks cover SGT midnight, integer-cent quantities, terminal lifecycle rules, and device-separated numbers. The production scaffold build is checked separately. SQL migration, authenticated device registration, browser IndexedDB persistence, and full offline behavior need a configured backend and browser integration checks; no claim of those passing is made here. PWA tooling (Serwist) is installed for the next milestone but its service worker is intentionally not activated yet.

Validated in this cloud instance: clean locked dependency install, TypeScript check, four passing domain tests, production build, and HTTP/content checks for `/`, `/orders`, `/barista`. Unconfigured registration returns HTTP 503 with `NOT_CONFIGURED`. These checks do not validate a hosted database or browser offline behavior.
