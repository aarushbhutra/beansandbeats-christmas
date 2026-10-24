# Person 2 validation evidence

Checks are local preview checks, not evidence of a deployed event system. Source is on `ayushman/guest-display-menu-reports`; all new work is attributed to Ayushman's configured Git identity.

## Automated checks

Run from `tools/person2-preview`:

| Command | Coverage |
| --- | --- |
| `pnpm test` | 24 passing unit cases: token header isolation and fragment shape; HTTP error sanitization; mock adapter parity; lead versus barista/anonymous permissions; input/revision checks; integer cents, quantities, cancellation statuses, immutable prices, duplicate/mismatched data, SGT midnight, missing/stale/pending devices, CSV formula prefixes/quoting, exact shared LeadHandlers and sync operation compatibility, staff bearer headers and persisted API normalization. |
| `pnpm typecheck` | Strict TypeScript across all four real routes, components, client boundary, handlers, unit tests and preview. |
| `pnpm test:e2e` | 10 passing Chromium cases, run against the production preview bundle: phone order progress/sound opt-in/stale state; landing/invalid links; board collection/removal; pending fixture save/reload and idempotent replay; fixture conflicts; CSV/date changes; role restrictions; stale HTTP 200 and name-free cache; guest outage reload and token isolation; tablet control size/width and empty board. |
| `pnpm build` | Production compilation and prerendering of the isolated host consuming actual production components. Fixture APIs remain disabled in production mode unless explicitly enabled for loopback review. |

After merging Person 1's workflow through `24dfd0b`, the **root** `pnpm typecheck`, `pnpm test` (7 domain, IndexedDB and database integration cases) and `pnpm build` also pass. The combined build includes all six screen routes plus the guest/menu/ready, staff device/order and sync APIs. The new shared tests cover atomic local order/QR/outbox writes, receipt replay, database conflicts and immutable snapshots. This does not establish a configured hosted deployment. Lead menu/report provider and route wiring remain fail closed. Shared root package/configuration/contract files were not modified by Person 2 beyond resolving merged ignore rules.

Cached reload tests intentionally block the data API while letting the local host serve executable pages. This proves snapshot reuse and clear stale labels. Fully offline app-shell reload requires Person 1's service worker and remains unverified. The preview's localStorage menu fixture proves the UI's provider contract and pending/conflict feedback; operational IndexedDB durability and sync receipts require Person 1's implementation.

## Exact dataset

| Order | SGT day | Status | Cups | Snapshot cents/cup | Included cents |
| --- | --- | --- | --- | --- | --- |
| 1126-A-001 | 2026-11-26 | queued | 2 | 600 | 1200 |
| 1126-A-002 | 2026-11-26 | making | 1 | 550 | 550 |
| 1126-A-003 | 2026-11-26 | ready | 1 | 650 | 650 |
| 1126-A-004 | 2026-11-26 | collected | 3 | 10 | 30 |
| 1126-A-005 | 2026-11-26 | cancelled | 2 | 600 | 0 (1200 excluded) |
| 1127-A-001 | 2026-11-27 | collected | 2 | 20 | 40 |

26 November: **7 cups, S$24.30 across 4 included orders**; cancellation: 2 cups/S$12.00. 27 November: **2 cups, S$0.40**. Current latte menu price S$6.50 differs from the first order's original S$6.00. A formula-like item name tests safe CSV output. Fixture B is initially unknown, so totals must display as provisional.

## Manual checks still required

Real phone scanning, sound/vibration on supported target devices, muted/locked/background restrictions, keyboard/screen-reader review, real tablet and booth monitor readability, first-use/warm-cache offline reloads, production guest token hashing/expiry and telemetry redaction, actual server role/session checks, multi-device reconciliation, lost-response sync retry, organiser POS import, deploy access and final video/PDF links.
