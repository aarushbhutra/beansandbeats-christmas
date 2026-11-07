import assert from "node:assert/strict";
import { test } from "node:test";
import { csvText, reportCsv } from "@/lib/domain/csv";
import { calculateDailyReport } from "@/lib/domain/report";
import { eventDay, judgeTransition, parsePriceToCents, prefixForIndex, publicNumber, shortNumber, cleanFirstName } from "@/lib/domain/rules";
import type { Order } from "@/lib/domain/types";

test("event day rolls over at Singapore midnight", () => {
  assert.equal(eventDay(new Date("2026-11-26T15:59:59Z")), "2026-11-26");
  assert.equal(eventDay(new Date("2026-11-26T16:00:00Z")), "2026-11-27");
});

test("lifecycle is forward-only and idempotent", () => {
  assert.equal(judgeTransition("queued", "making"), "apply");
  assert.equal(judgeTransition("queued", "ready"), "apply");
  assert.equal(judgeTransition("ready", "making"), "noop");
  assert.equal(judgeTransition("collected", "ready"), "noop");
  assert.equal(judgeTransition("collected", "cancelled"), "conflict");
  assert.equal(judgeTransition("cancelled", "making"), "conflict");
  assert.equal(judgeTransition("cancelled", "cancelled"), "noop");
});

test("numbers, prefixes, prices and names", () => {
  assert.equal(publicNumber("2026-11-26", "A", 7), "1126-A-007");
  assert.equal(shortNumber("1126-AB-120"), "AB-120");
  assert.equal(prefixForIndex(0), "A");
  assert.equal(prefixForIndex(26), "AA");
  assert.equal(parsePriceToCents("6.5"), 650);
  assert.equal(parsePriceToCents("$12"), 1200);
  assert.equal(parsePriceToCents("1.234"), null);
  assert.equal(cleanFirstName("  <Ana>\n Lee "), "Ana Lee");
  assert.equal(cleanFirstName("   "), null);
});

test("CSV neutralises formulas and keeps integer cents", () => {
  assert.equal(csvText("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assert.equal(csvText(" \t+1"), `"' \t+1"`);
  assert.equal(csvText('say "hi"'), `"say ""hi"""`);
  const order = (status: Order["status"], publicNo: string, day = "2026-11-26"): Order => ({
    id: publicNo, publicNumber: publicNo, shortNumber: shortNumber(publicNo), deviceId: "d", deviceSequence: 1, eventDay: day, firstName: null,
    items: [{ menuItemId: "m", menuRevision: 1, nameSnapshot: "@latte", unitPriceCentsSnapshot: 655, quantity: 3, milk: "oat", temperature: "hot" }],
    totalCents: 1965, status, revision: 1, flags: [], createdAtDevice: "2026-11-26T02:00:00Z", receivedAtServer: "2026-11-26T02:00:01Z",
    updatedAtServer: null, makingAt: null, readyAt: "2026-11-26T02:04:00Z", collectedAt: null, cancelledAt: null, cancellationReason: null,
  });
  const report = calculateDailyReport({ day: "2026-11-26", now: new Date("2026-11-26T03:00:00Z"), devices: [], orders: [order("collected", "1126-A-001"), order("cancelled", "1126-A-002"), order("collected", "1127-A-001", "2026-11-27")] });
  assert.equal(report.cups, 3);
  assert.equal(report.totalCents, 1965);
  assert.equal(report.cancelledTotalCents, 1965);
  assert.equal(report.prep.medianSeconds, 240);
  assert.equal(report.hourly[0].hour, 10);
  assert.equal(report.reconciliation.complete, false);
  const csv = reportCsv(report);
  assert.ok(csv.startsWith("﻿eventDay,publicNumber,orderedAtSgt"));
  assert.match(csv, /"'@latte"/);
  assert.match(csv, /,3,655,1965,"collected"/);
  assert.equal(csv.trim().split("\r\n").length, 3);
});

test("pickup codes and modifier pricing", async () => {
  const { parseCollectCode, unitPriceCents } = await import("@/lib/domain/rules");
  assert.equal(parseCollectCode("BBCOLLECT:1126-A-042"), "1126-A-042");
  assert.equal(parseCollectCode("a-42"), "A-042");
  assert.equal(parseCollectCode("A042"), "A-042");
  assert.equal(parseCollectCode("https://evil.example"), null);
  const latte = { priceCents: 800, icedSurchargeCents: 100, milkSurcharges: { oat: 100 } };
  assert.equal(unitPriceCents(latte, "milk", "hot"), 800);
  assert.equal(unitPriceCents(latte, "oat", "iced"), 1000);
});
