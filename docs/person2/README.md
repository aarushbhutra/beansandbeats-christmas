# Person 2 delivery — Ayushman

[Technical summary (one-page PDF)](technical-summary.pdf) · [Three-minute preview walkthrough](person2-walkthrough.mp4) · [Six-screen wireframes](wireframes.svg)

Branch: `ayushman/guest-display-menu-reports`. Author: `ayushman-2008 <ayushman.chaudhuri@gmail.com>`.

This branch implements modules 3–6 from [the project brief](https://myprojet.co/x/company-8/christmas-together-2026-queue-management-system) and [Person 2's plan](../../plans/PERSON-2-GUEST-AND-DISPLAY.md). The shared application did not exist when work began; Person 1's subsequently published scaffold is now merged into this branch. Production screens default to the agreed HTTP APIs and depend on Person 1's authenticated menu/outbox provider; the isolated preview supplies explicit test doubles. Nothing in `tools/person2-preview` is a production authentication or sync implementation.

## Run locally

Use Node 22.13+ (tested with Node 25.5) and pnpm 11.25.0, as pinned in the shared scaffold. No cloud credentials are required for the preview.

If pnpm isn't on your PATH, run commands through `npm exec --yes --package=pnpm@11.25.0 -- pnpm`.

```sh
cd tools/person2-preview
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:3202>. Select a preview role and open the four screens from the console. Use the console to simulate barista status changes in a second tab. Data is persisted in the ignored `.data/fixtures.json`; reset only these sample records with the console. The role cookie and localStorage fixture operations are deliberately confined to this host.

The isolated preview has its own `pnpm-workspace.yaml` and `pnpm-lock.yaml`; it does not add dependencies to the shared root package.

```sh
pnpm test
pnpm typecheck
pnpm test:e2e
pnpm build
```

If Playwright's browser isn't installed: `pnpm exec playwright install chromium`. `test:e2e` uses an existing local preview or starts one. For a production-mode preview after building, explicitly enable development fixtures: `PERSON2_PREVIEW_ENABLED=1 pnpm start`. Bind to loopback and never publish this fixture host.

To regenerate the submission materials, run `pnpm pdf` and, with the preview running, `pnpm record`. Recording requires Playwright Chromium and `ffmpeg`, takes just over three minutes, refreshes the screenshots and produces a silent, captioned 180-second MP4. `pnpm record -- --screenshots-only` captures the screenshots without recording.

## Delivered files

| Area | Implementation |
| --- | --- |
| Guest | `app/guest`, `components/person2/guest-screen.tsx`: fragment-token access; five lifecycle states; quantity/modifier summary; live polling; explicit ready alert; tap-enabled sound; optional vibration; invalid/loading/offline states; token-isolated tab-session cache. |
| Ready board | `app/ready`, `components/person2/ready-screen.tsx`: names and numbers only; ready orders removed on collection; empty/stale states; names hidden during outages; only numbers cached for reload. |
| Menu | `app/lead/menu`, `components/person2/menu-screen.tsx`: existing item names, integer-cent prices, milk/temperature choices, sold-out and active flags; durable submit interface; pending indicators; revision conflicts. |
| Reports | `app/lead/reports`, `lib/server/reports`: pure daily snapshot calculation; SGT event-day filter; quantities and cancellations; reconciliation warnings for all registered devices; JSON/CSV from the same calculation; no names or tokens in exports. |
| Server menu | `lib/server/menu`: injected authenticated principal and repository; lead-only writes; strict validation; atomic revision contract; anonymous readers see active items only. |
| Integration | `lib/client`: shared entity re-exports, HTTP/mock public adapters, staff provider bridge, no implicit mock fallback; [handoff](INTEGRATION.md). |
| Submission | One-page PDF and reproducible PDF generator; three-minute Person 2 preview recording and capture script; six-screen wireframes; final demo script, acceptance checklist and operator questions. |

## Current acceptance status

Unit tests and automated browser checks exercise the actual screens against the isolated HTTP fixture server, including persisted menu fixture changes, conflict feedback, stale successful responses, cached API-outage reloads, role restrictions and CSV download. They do **not** prove a configured production Supabase deployment or full operational offline behavior. See [validation details](VALIDATION.md).

Still needs Person 1: provider/session mapping, database repositories, route wiring, token-hash guest endpoint and ready projection, operational IndexedDB/outbox and service worker, deployment and test logins. The final six-module video must be recorded against that integrated deployment, including real order entry, QR scan and offline order replay. The included recording is labelled a Person 2 preview throughout; it is not the final event-submission evidence.

The required live link and final demo link cannot be supplied before that integration. Person 1 owns the repository's top-level README; [submission checklist](SUBMISSION.md) includes the exact README links to add once verified.
