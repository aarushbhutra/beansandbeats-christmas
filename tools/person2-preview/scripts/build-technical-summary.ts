import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Beans & Beats - Person 2 technical summary"); pdf.setAuthor("Ayushman (ayushman-2008)");
  pdf.setSubject("Implemented modules 3-6, verified preview behavior and production integration dependencies");
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const forest = rgb(.086, .243, .196), muted = rgb(.37, .41, .36), cream = rgb(.973, .961, .925), line = rgb(.8, .82, .76);
  page.drawRectangle({ x: 0, y: 0, width: 596, height: 842, color: cream });
  function text(value: string, x: number, y: number, size = 9.3, font = regular, color = forest) { page.drawText(value, { x, y, size, font, color }); }
  function paragraph(value: string, x: number, y: number, width: number, size = 9.3) {
    const words = value.split(/\s+/); let row = "";
    for (const word of words) {
      if (regular.widthOfTextAtSize(`${row} ${word}`.trim(), size) > width && row) { text(row, x, y, size); y -= 13; row = word; } else row += (row ? " " : "") + word;
    }
    if (row) { text(row, x, y, size); y -= 13; } return y;
  }
  function section(title: string, body: string, x: number, y: number) { text(title, x, y, 11, bold); return paragraph(body, x, y - 20, 249) - 23; }
  text("BEANS & BEATS / CHRISTMAS TOGETHER 2026", 36, 802, 9, bold);
  text("A little coffee. A lot of good.", 36, 758, 29, serif);
  text("Technical summary - Person 2 / Ayushman (ayushman-2008)", 36, 735, 10, regular, muted);
  page.drawLine({ start: { x: 36, y: 719 }, end: { x: 559, y: 719 }, color: line });
  page.drawRectangle({ x: 36, y: 655, width: 523, height: 49, color: rgb(.933, .902, .82) });
  text("STATUS: IMPLEMENTED MODULES, PREVIEW VERIFIED", 48, 686, 9, bold);
  paragraph("Person 1's initial scaffold is merged and shared types are reused. Backend routes, operational sync and deployment still require integration. This PDF records actual scope, not event readiness.", 48, 672, 498, 8.6);
  text("ARCHITECTURE / DEPENDENCY BOUNDARY", 36, 630, 9, bold);
  const boxes = [
    [36, "Phone + public board", "React / 3-5 second polling"],
    [217, "Person 2 adapters / handlers", "Typed HTTP + injected repository"],
    [398, "Person 1 shared backend", "Auth / DB / outbox / app shell"],
  ] as const;
  for (const [x, title, subtitle] of boxes) {
    page.drawRectangle({ x, y: 569, width: 161, height: 46, borderColor: line, borderWidth: 1 });
    text(title, x + 8, 596, 8.7, bold); text(subtitle, x + 8, 581, 7.6, regular, muted);
  }
  for (const x of [199, 380]) { text(">", x + 3, 586, 12, bold); }
  let left = 540, right = 540;
  left = section("01  Stack and delivered scope", "Next.js App Router pages and TypeScript/React components for guest tracking, ready board, lead menu and daily reports. Scoped CSS, HTTP/mock adapter parity, dependency-injected menu/report handlers. Separate Next.js preview host uses persisted sample data and explicit test doubles; it is not a production service.", 36, left);
  left = section("02  Offline reads and alerts", "Guest snapshots are tab-session cached under token-derived keys. Board caches numbers only; names disappear during stale/offline views. Polling retries on reconnect/foreground, times out and rejects old snapshots. Sound requires a tap; vibration is optional. Locked, muted and background phones have no delivery guarantee. No push or SMS.", 36, left);
  left = section("03  Durable edits and conflicts", "Menu writes delegate to Person 1's submitOperation; success means durable local acceptance, with pending and conflict states. Shared LeadHandlers and sync-operation mapping are provided. Repository writes require atomic expected-revision checks; price edits never change order snapshots. IndexedDB persistence, receipt idempotency and full offline app-shell reload remain integration gates.", 36, left);
  right = section("04  Sales and reconciliation", "Integer-cent snapshots, quantities and original SGT eventDay drive both JSON and CSV. Recorded queued/making/ready/collected orders count; cancellations are separate. Unknown/stale devices or pending work keep totals provisional. CSV quotes fields, neutralizes formula prefixes and omits names/tokens. POS payment/column definitions need organiser confirmation.", 310, right);
  right = section("05  Personal data and access", "First name only on the ready board until collection; guest response omits names/internal IDs. Tracking fragment is sent only in Authorization. Person 1 must issue random tokens, store hashes, enforce sessions/roles and database permissions, use HTTPS and redact telemetry. Supplied handlers reuse shared roles and reject non-leads. Retention/signage needs organiser approval; no legal certification is claimed.", 310, right);
  right = section("06  Evidence and limits", "Automated unit and Chromium tests cover totals, CSV, role checks, live status, stale/cache behavior and fixture menu conflicts. Fixture auth/storage do not prove production security or sync. Real phone/tablet checks, lost-response replay, deployed six-module flow and final QR/offline demo remain required. No cross-device updates while disconnected; first loads need connectivity.", 310, right);
  const bottom = Math.min(left, right);
  if (bottom < 70) throw new Error(`Summary overflow: ${bottom}`);
  page.drawLine({ start: { x: 36, y: 63 }, end: { x: 559, y: 63 }, color: line });
  text("Source and reproducible checks: docs/person2/README.md | Branch: ayushman/guest-display-menu-reports", 36, 45, 7.5, regular, muted);
  const out = path.resolve(process.cwd(), "../../docs/person2/technical-summary.pdf");
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, await pdf.save());
  console.log(`Wrote one-page summary: ${out}`);
}
void main();
