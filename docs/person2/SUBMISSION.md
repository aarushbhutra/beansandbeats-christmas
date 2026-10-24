# Final submission checklist and demo script

Owner of Person 2 modules and these materials: Ayushman (`ayushman-2008`). Dates and event-day calculations use Asia/Singapore.

## Deliverable status

- [x] Modules 3–6 implemented with real HTTP adapters and injected shared interfaces.
- [x] Persisted sample-data host, report/menu handlers and reproducible tests.
- [x] Six-screen wireframes with ownership boundaries.
- [x] One-page technical PDF describing the implementation and remaining dependencies.
- [x] Labelled three-minute Person 2 preview walkthrough, with reproducible recorder.
- [ ] Person 1 publishes scaffold, operational auth/outbox/PWA and database repositories.
- [ ] Integrate route wiring, shared contracts/provider and persisted production data.
- [ ] Real phone QR scan and actual tablet/large-display checks, including sound enabled/disabled, locked and muted phones.
- [ ] Validate lost acknowledgements, exactly-once order sync, conflict resolution and cached offline app-shell reloads.
- [ ] Confirm organiser's menu, report sales statuses, actual POS CSV, retention/signage and browser/device targets.
- [ ] Deploy all six modules with working test barista and lead accounts; verify from a clean browser.
- [ ] Record the final end-to-end three-minute submission video below, replacing the preview recording.
- [ ] Update the PDF with verified Person 1 architecture and limitations; confirm it remains one page.
- [ ] Person 1 places live, final video and PDF links at the top of the repository README.
- [ ] Complete rehearsal by 7 November 2026; confirm 8 November pitch time and submit before pitches start.
- [ ] Jointly confirm availability for the dry run in the week of 16 November and event support 26–29 November before promising it.

README block for Person 1 (fill verified links rather than publishing placeholders):

```text
Live app: <verified HTTPS deployment>
Demo video (3 min): <accessible final recording>
Technical summary (1 page): docs/person2/technical-summary.pdf
Test logins: <provisioned accounts / secure instructions>
```

## Final three-minute demo shot list

| Time | Screen/action | Narration and evidence |
| --- | --- | --- |
| 0:00–0:20 | Open live app, identify staff/guest/lead roles. | Coffee queue problem; first name only; payments stay at organiser POS. |
| 0:20–0:55 | Real order entry: first name, drink, quantity, milk, temperature. Save, show actual order QR and scan on phone. | Order has a unique number; guest sees the same drink snapshots. No public order enumeration. |
| 0:55–1:30 | Disable tablet Wi-Fi. Save another order or advance a known order, then refresh/reopen cached tablet screen. | Local data and pending outbox survive. Another disconnected device cannot see these changes yet. |
| 1:30–2:15 | Restore Wi-Fi; show replay acknowledgement and one persisted order. Mark ready; guest alerts and board adds number/name; collect it. | No duplicate orders on retry. Optional phone sound was enabled with a tap; foreground alert limits. Board removes collected name. |
| 2:15–2:45 | Lead changes price/sold-out; compare original order snapshot with new menu. Open date report and download CSV. | Known cup/cents totals, cancellations excluded; reconcile all tablets before close. |
| 2:45–3:00 | One-page PDF/architecture and final screen. | Actual stack, offline boundary, token/name controls, known limits and next operational test. |

The included `person2-walkthrough.mp4` shows guest/ready/menu/report implementation and a fixture offline menu queue. It does not show real Person 1 order entry, production sync, QR generation or deployment, so it cannot replace the final shot list.

## Questions for the organiser

Confirm the actual menu and modifiers; whether queued/making/ready orders count in daily POS totals; exact CSV columns; tablet/browser models; expected peak simultaneous orders; first-name board signage/consent; retention and deletion period; whether background notifications are required; and pitch start time. No organiser answer has been assumed or fabricated.

## Daily export validation

Reconnect every registered tablet; resolve pending/conflicted work; wait for fresh device watermarks; select the original SGT event day; compare recorded order values and cancellations with POS; download/review CSV and record any mismatch. A provisional export remains useful but its reconciliation flag is false. Do not delete orders or reset device counters as a substitute for a new event day. Person 1 owns the final operational reset runbook.
