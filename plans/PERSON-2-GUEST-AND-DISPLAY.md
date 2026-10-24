# Plan 2 — Friend: guest tracking, ready board, menu controls, sales reports

Suggested assignment; swap names if needed. Read [the shared agreement](SHARED-CONTRACT.md). Own modules 3–6 and submission presentation. Reuse Person 1's auth and offline helpers rather than building a second sync system.

## Your outputs

- Phone guest page reached by per-order QR, live status, and an in-page ready alert.
- Public screen showing first names and order numbers awaiting collection.
- Booth-lead menu editing: items, prices, and sold-out flags.
- Daily cups/totals and CSV exports.
- Three-minute demo video and one-page technical PDF, with technical input from Person 1.

## 25 October: work while scaffolding happens

1. Sketch all six modules together, then detail your four screens. Use a restrained Christmas theme, tablet-sized controls, large public numbers, and readable contrast.
2. Agree on guest token flow, lifecycle, menu shape, sync hook signatures, CSV columns, and permission boundaries.
3. Prepare exact contract fixtures: queued/making/ready/collected/cancelled orders, quantities, changed menu prices, stale/offline responses, and two SGT dates.
4. Branch once Person 1 publishes the base. Own your pages/components, lib/client adapters, lib/server/menu and lib/server/reports. Ask Person 1 to change shared dependencies/config.

## 26–28 October: build four modules independently

- Guest: mobile status page, order summary, big number, last-update indicator, loading/invalid-link/offline states. Poll through an adapter with mock and real implementations.
- Alert: prominent ready state and optional sound after the guest taps an enable control. Handle unsupported vibration and muted/background browsers honestly.
- Board: show only ready first names and numbers; remove on collection. Show an empty state and stale-data indicator.
- Menu: lead-only form for item names/prices/modifier options, sold out, and active/inactive. Use shared submitOperation for durable edits, pending state and conflict feedback once available.
- Reports: write a pure calculation over immutable order/item snapshots. Support SGT day filtering, cups, integer-cent totals, cancellations, and a clear definition of included statuses.
- CSV: use the same calculation as the screen; quote fields and neutralize spreadsheet formulas in user-editable text. Keep export fields minimal and omit guest names unless the organiser requires them.
- Deliver menu/report handler implementations using agreed signatures; Person 1 supplies authentication and route wiring.

## 29–31 October: connect to real data

- Replace fixtures on the demo path with deployed APIs.
- Scan an actual QR on a phone; exercise queued → making → ready → collected.
- Connect menu sold-out and price changes to order entry. Confirm existing orders preserve original prices.
- Test lead-only report/menu access and barista restrictions.
- Verify public board name removal and that guest APIs cannot enumerate other orders.
- Confirm report totals match a small known dataset and explain any mismatch to Person 1.

## 1–3 November: offline UX and reconciliation

- Test cached guest/board reloads; show last synced state during outages and catch up on reconnect.
- Verify offline menu edits survive reload, show pending status, and resolve revision conflicts through Person 1's helpers.
- Show report reconciliation warnings while any registered device's known data is pending or its freshness is unknown. Server totals are not evidence every disconnected tablet is synced.
- Run CSV fixtures for multiple quantities, cancellations, price edits, decimal sums, SGT midnight, and formula-like text.
- Compare the provisional CSV with the organiser's actual POS format as soon as available.
- Check actual phone alert behavior with sound enabled and disabled; record limitations for the PDF.

## 4–7 November: demonstrate and submit

- Check screen layouts on a real tablet, phone and large display; keyboard access, labels and contrast.
- Write a concise demo script and record a final three-minute video:
  - 0:00–0:20: booth problem and roles.
  - 0:20–0:55: enter a named drink with milk/temperature; scan the order QR.
  - 0:55–1:30: turn off tablet connectivity, save another order or advance a known order; show pending sync and retained data.
  - 1:30–2:15: restore connectivity, show exactly-once sync, guest ready alert, board, then collection.
  - 2:15–2:45: sold-out/price control and daily CSV totals.
  - 2:45–3:00: architecture, offline limits and event readiness.
- Produce the one-page technical PDF with Person 1: stack/architecture diagram, local outbox and sync, conflict handling, first-name/token storage, access/retention controls, and known limitations. Describe actual implementation rather than aspirational features.
- Give Person 1 the live/video/PDF links for the top of README; jointly verify access in a clean browser.
- Complete a submission checklist and pitch rehearsal by 7 November. Submit the repo before pitches begin on 8 November.

## Done means

All four owned modules use real persisted data. Guest alerts and ready board reflect barista changes, menu edits affect new orders correctly, and CSV matches the agreed sales definition. Stale/offline views are explicit. Required video and one-page PDF are accessible and linked at the top of README.

## Boundaries and handoffs

Use mocks only during independent development. Keep API differences in your adapter; report backend bugs with reproducible steps and fake/redacted data. Ask Person 1 for shared infrastructure fixes rather than creating competing auth, outbox or database clients.

Cut animation and branding polish first if time runs short. All six modules, offline recovery, accurate reports, and required submission artifacts remain required.
