# Person 2 delivery — Ayushman

[Technical summary (one-page PDF)](technical-summary.pdf) · [Three-minute preview walkthrough](person2-walkthrough.mp4) · [Six-screen wireframes](wireframes.svg)

Branch: `ayushman/guest-display-menu-reports`. Author: `ayushman-2008 <ayushman.chaudhuri@gmail.com>`.

This branch implements modules 3–6 from [the project brief](https://myprojet.co/x/company-8/christmas-together-2026-queue-management-system) and [Person 2's plan](../../plans/PERSON-2-GUEST-AND-DISPLAY.md). The shared application did not exist when work began. Production screens default to the agreed HTTP APIs and depend on Person 1's authenticated menu/outbox provider; the isolated preview supplies explicit test doubles. Nothing in `tools/person2-preview` is a production authentication or sync implementation.

## Run locally

Use Node 22.13+ (tested with Node 25.5) and npm. No cloud credentials are required for the preview.

```sh
cd tools/person2-preview
npm ci
npm run dev
```

Open <http://127.0.0.1:3202>. Select a preview role and open the four screens from the console. Use the console to simulate barista status changes in a second tab. Data is persisted in the ignored `.data/fixtures.json`; reset only these sample records with the console. The role cookie and localStorage fixture operations are deliberately confined to this host.

```sh
npm test
npm run typecheck
npm run test:e2e
npm run build
```

If Playwright's browser isn't installed: `npx playwright install chromium`. `test:e2e` uses an existing local preview or starts one. For a production-mode preview after building, explicitly enable development fixtures: `PERSON2_PREVIEW_ENABLED=1 npm start`. Bind to loopback and never publish this fixture host.

## Delivered files

| Area | Implementation |
| --- | --- |
| Guest | `app/guest`, `components/person2/guest-screen.tsx`: fragment-token access; five lifecycle states; quantity/modifier summary; live polling; explicit ready alert; tap-enabled sound; optional vibration; invalid/loading/offline states; token-isolated tab-session cache. |
| Ready board | `app/ready`, `components/person2/ready-screen.tsx`: names and numbers only; ready orders removed on collection; empty/stale states; names hidden during outages; only numbers cached for reload. |
| Menu | `app/lead/menu`, `components/person2/menu-screen.tsx`: existing item names, integer-cent prices, milk/temperature choices, sold-out and active flags; durable submit interface; pending indicators; revision conflicts. |
| Reports | `app/lead/reports`, `lib/server/reports`: pure daily snapshot calculation; SGT event-day filter; quantities and cancellations; reconciliation warnings for all registered devices; JSON/CSV from the same calculation; no names or tokens in exports. |
| Server menu | `lib/server/menu`: injected authenticated principal and repository; lead-only writes; strict validation; atomic revision contract; anonymous readers see active items only. |
| Integration | `lib/client`: typed boundary, HTTP/mock public adapters, staff provider bridge, no implicit mock fallback; [handoff](INTEGRATION.md). |
| Submission | One-page PDF and reproducible PDF generator; three-minute Person 2 preview recording and capture script; six-screen wireframes; final demo script, acceptance checklist and operator questions. |

## Current acceptance status

Unit tests and automated browser checks exercise the actual screens against the isolated HTTP fixture server, including persisted menu fixture changes, conflict feedback, stale successful responses, cached API-outage reloads, role restrictions and CSV download. They do **not** prove the absent production Supabase/Dexie/auth/PWA implementation. See [validation details](VALIDATION.md).

Still needs Person 1: shared scaffold/layout, provider mapping, database repositories, route wiring, token-hash guest endpoint and ready projection, operational IndexedDB/outbox and service worker, deployment and test logins. The final six-module video must be recorded against that integrated deployment, including real order entry, QR scan and offline order replay. The included recording is labelled a Person 2 preview throughout; it is not the final event-submission evidence.

The required live link and final demo link cannot be supplied before that integration. Person 1 owns the repository's top-level README; [submission checklist](SUBMISSION.md) includes the exact README links to add once verified.
