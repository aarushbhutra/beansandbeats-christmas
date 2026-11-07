# Testing guide

For the team and the barista dry run (week of 16 Nov). The build must be test-ready by Fri 13 Nov.

## Fastest: test the live deployment

**https://beansandbeats-christmas.vercel.app** runs on HTTPS with a Singapore Postgres database, so every device works: camera scanning, offline reload and live updates.

1. On the counter tablet, open `/login` and sign in as `lead`. Go to **lead → tablets → register**.
2. Follow the role-play in section 3 below.
3. When you're done testing, use **lead → tablets → reset test data** to start clean.

Credentials are shared privately (not in this repo). Change them under **lead → team** after the first sign-in.

To run the automated browser suite against the live site:

```bash
PLAYWRIGHT_BASE_URL=https://beansandbeats-christmas.vercel.app E2E_LEAD_PASSWORD=… E2E_BARISTA_PASSWORD=… npx pnpm@11.25.0 test:e2e
```

## 0. One-time local setup (5 min)

```bash
npx pnpm@11.25.0 install --frozen-lockfile   # or `pnpm install --frozen-lockfile` if pnpm is installed
npx pnpm@11.25.0 setup:local                 # creates .env.local with random lead/barista passwords (prints them)
cat .env.local                               # if it says ".env.local already exists", the passwords are in here
```

The local database is created in `.data/pglite` on first request. It seeds two accounts (`lead`, `barista`) and Aden's WIP menu: espresso $3, americano $6, latte $8, flat white $8, pour-over $10, iced +$1, oat +$1, no milk choice for black drinks. To start over: stop the server and `rm -rf .data`.

## 1. Automated checks (2 min)

```bash
npx pnpm@11.25.0 typecheck
npx pnpm@11.25.0 test            # 16 backend/domain tests on real SQL
npx pnpm@11.25.0 build
npx pnpm@11.25.0 test:e2e        # Chromium: offline order → reload → reconnect → synced exactly once; role checks
```

## 2. Run it

- **UI work:** `npx pnpm@11.25.0 dev`, then open http://localhost:3000. The dev server does **not** register the offline service worker.
- **Offline or real-device testing:** `npx pnpm@11.25.0 build && npx pnpm@11.25.0 start`.

Real tablets and phones need **HTTPS**. Browsers only allow the camera (pickup scanner) and the service worker (offline reload) on HTTPS or `localhost`. A plain `http://192.168.x.x:3000` URL on an iPad will **not** scan QR codes or reload offline. Use one of:

- **Vercel deploy (recommended):** see section 4.
- **Quick tunnel from your laptop:** `brew install cloudflared`, then `cloudflared tunnel --url http://localhost:3000` (with `pnpm start` running). Open the printed `https://….trycloudflare.com` URL on every device.

## 3. Booth role-play (about 30 min)

Use 4–5 screens: a **counter tablet**, a **bar tablet/laptop with a camera**, a **TV/laptop** for `/ready`, **two phones** for guests, and optionally a lead laptop.

| # | Do this | Expect |
|---|---|---|
| 1 | Counter tablet: `/login` as `lead`, then **lead → tablets & sync → register** ("counter"). Repeat on the bar device ("bar"). | Letters A and B. `/lead` lists both tablets as "in sync". |
| 2 | Bar device: sign out, sign in as `barista`, open `/barista`. TV: open `/ready` (no login). | Board says "brewing the next drop." |
| 3 | Counter `/orders`: latte → oat → iced → add, name "Mei" → **send to bar**. | Price $10.00. Ticket shows **A-001**, a big "key into pos $10.00" and a QR. |
| 4 | Espresso and americano. | No milk question. Iced adds $1. |
| 5 | Guest phone scans the QR on the counter screen. | The tracker shows "Order A-001", the drinks, ● Received, the position in line and an ETA estimate. Tap **turn on sound**. |
| 6 | Bar: **start making** on A-001. | Within ~1 s the phone shows ● Making and the TV lists A-001 Mei under "Making". |
| 7 | Bar: **ready**. | The phone goes full-screen black ("your drink is ready"), buzzes (Android), chimes if sound is on, and shows a **pickup QR**. The TV shows A-001 Mei under "Ready". |
| 8 | Bar: **scan pickup** and point the camera at the guest's phone. | A-001, Mei and the items appear. Tap **handed over**: the order leaves the board and the phone shows "collected". Also try typing `A-001` instead of scanning. |
| 9 | **Wi-Fi drop:** open `/orders` and `/barista` once on the counter tablet while online (production/HTTPS build), then turn its Wi-Fi off. | The sync status turns black: "offline". |
| 10 | Offline: take 2 orders, start making one, then **reload the page** and switch between take orders and bar queue. | Pages still load and both orders are still there. Pill: "offline · 3 saved". The ticket says "will sync when back online". |
| 11 | Turn Wi-Fi back on. | Pill: syncing → "synced". Bar device and TV catch up. `/lead/reports` counts each order **once**. The offline orders' guest QRs now work. |
| 12 | **Conflict:** bar device offline, cancel order X. Counter (online) marks X ready, then collected. Reconnect the bar device. | Bar sync pill shows "1 to review" with an explanation. `/lead/devices` lists the conflict. X stays collected and never moves backwards. |
| 13 | **Menu:** lead `/lead/menu` → latte "sold out" on. | Counter shows latte struck "sold out" within seconds. |
| 14 | **Offline sale of a sold-out item:** counter offline, lead marks flat white sold out, counter sells a flat white, reconnect. | The order is accepted at the price charged and flagged "sold out at sync" in reports. |
| 15 | **Price change:** change latte to $9. | New orders cost $9. Older rows in `/lead/reports` keep $8. |
| 16 | **Roles:** as `barista`, open `/lead`. Logged out, open `/api/lead/reports`. | "leads only" page. `{"error":{"code":"AUTH_REQUIRED"…}}` with 401. |
| 17 | **Reports:** `/lead/reports` → csv, then open it in Sheets/Excel. | Rows match the orders. Totals include iced/oat surcharges. Cancelled rows are listed but excluded. The file is named `-provisional` until every order is collected and every tablet has synced. |
| 18 | **Close day:** collect everything, make sure all tablets are synced, **close day**. | "reconciled" banner, and the closure is recorded. |
| 19 | **Privacy:** wait 15 min after a collection, or restart with `NAME_RETENTION_MINUTES=1`. | The name disappears from bar history and reports data. The board never shows collected names. |
| 20 | **Bad links:** `/guest` (no token), and `/guest#` followed by 43 random letters. | Landing explainer, then "almost there…" (not found). It never shows someone else's order. |

## 4. Deploy a test environment (Vercel + Neon)

1. Push the branch, then import the repo in Vercel (framework: Next.js).
2. Vercel → Storage → Marketplace → **Neon** → connect. This sets `DATABASE_URL`.
3. Add env vars:
   - `BOOTSTRAP_LEAD_PASSWORD`
   - `BOOTSTRAP_BARISTA_PASSWORD` (10+ chars, used only on an empty database)
   - `CRON_SECRET` (random string)
4. Deploy, then open `https://<app>/api/health`. Expect `{"ok":true,"storage":"postgres"}`.
5. Sign in as `lead` and change both bootstrap passwords under **lead → team**. Create the judges' test logins there and share them privately.

If `/lead` shows a red "demo storage" banner, `DATABASE_URL` is missing and data can vanish.

## 5. Still to confirm with Aden

- **Final menu and prices:** should espresso and pour-over be orderable iced?
- **Hardware:** tablet models (iPad Safari uses the built-in jsQR scanner), and whether the bar device has a usable camera angle for scanning phones.
- **POS:** whether the POS person reads the total from the counter tablet ticket ("key into pos").
- **Retention:** is a 15-minute name deletion after pickup OK under their PDPA policy?
- **Team credit:** the wording for the ready-board credit.
