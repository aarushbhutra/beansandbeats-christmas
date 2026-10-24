/** Reproducible capture of actual UI. Sample infrastructure is visibly labelled throughout. */
import { chromium, request, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { FIXTURE_TOKEN } from "../../../lib/client/fixtures";

const baseURL = "http://127.0.0.1:3202";
const output = path.resolve(process.cwd(), "../../docs/person2");
async function main() {
  await mkdir(path.join(output, "screenshots"), { recursive: true });
  const browser = await chromium.launch();
  const api = await request.newContext({ baseURL });
  await api.post("/api/preview/reset");
  const shots = await browser.newContext({ baseURL, viewport: { width: 1280, height: 960 } });
  await shots.request.post("/api/preview/session", { data: { role: "booth_lead" } });
  const shot = await shots.newPage();
  await shot.setViewportSize({ width: 390, height: 1000 });
  await shot.goto(`/guest#token=${FIXTURE_TOKEN}`);
  await expect(shot.getByRole("heading", { name: "You're in the queue" })).toBeVisible();
  await shot.screenshot({ path: path.join(output, "screenshots", "guest-phone.png"), fullPage: true });
  await api.post("/api/preview/status", { data: { status: "ready" } });
  await expect(shot.getByRole("heading", { name: "Your drinks are ready!" })).toBeVisible({ timeout: 10000 });
  await shot.screenshot({ path: path.join(output, "screenshots", "guest-ready.png"), fullPage: true });
  await shot.setViewportSize({ width: 1920, height: 1080 });
  await shot.goto("/ready"); await expect(shot.getByText("Jamie", { exact: true })).toBeVisible();
  await shot.screenshot({ path: path.join(output, "screenshots", "ready-board.png"), fullPage: true });
  await shot.setViewportSize({ width: 1280, height: 960 });
  await shot.goto("/lead/menu"); await expect(shot.getByRole("textbox", { name: "Price for White Christmas Latte" })).toHaveValue("6.50");
  await shot.screenshot({ path: path.join(output, "screenshots", "lead-menu.png"), fullPage: true });
  await shot.goto("/lead/reports"); await expect(shot.getByText("$24.30", { exact: true })).toBeVisible();
  await shot.screenshot({ path: path.join(output, "screenshots", "lead-reports.png"), fullPage: true });
  await shots.close();
  console.log("Captured phone, ready, menu and report screenshots.");
  if (process.argv.includes("--screenshots-only")) { await api.dispose(); await browser.close(); return; }

  await api.post("/api/preview/reset");
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 }, recordVideo: { dir: path.join(process.cwd(), "test-results", "recording"), size: { width: 1280, height: 900 } } });
  await context.request.post("/api/preview/session", { data: { role: "booth_lead" } });
  const page = await context.newPage();
  const video = page.video()!;
  const start = Date.now();
  async function until(seconds: number) { const remaining = start + seconds * 1000 - Date.now(); if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining)); }
  async function caption(title: string, detail: string) {
    await page.evaluate(({ title, detail }) => {
      document.getElementById("p2-video-caption")?.remove();
      const panel = document.createElement("aside"); panel.id = "p2-video-caption";
      Object.assign(panel.style, { position: "fixed", bottom: "0", left: "0", right: "0", zIndex: "99999", padding: "18px 36px", background: "#f0e5ca", color: "#193b32", borderTop: "2px solid #b89a62", font: "16px/1.5 Arial,sans-serif", boxShadow: "0 -5px 25px #0001" });
      const heading = document.createElement("strong"); heading.textContent = title;
      const body = document.createElement("div"); body.textContent = detail;
      panel.append(heading, body); document.body.append(panel);
    }, { title, detail });
  }
  await page.goto("/");
  await caption("PERSON 2 PREVIEW / Ayushman / Modules 3–6", "Actual screens, persisted sample data. Person 1's production order entry, auth, app shell and sync are still integration dependencies.");
  await until(16);
  await page.goto(`/guest#token=${FIXTURE_TOKEN}`); await expect(page.getByRole("heading", { name: "You're in the queue" })).toBeVisible();
  await caption("01 / Guest tracking", "An order-specific fragment token is sent in Authorization, never an API URL. This sample order has two oat lattes. Production QR issuance belongs to Person 1.");
  await page.getByRole("button", { name: "Enable sound alert" }).click();
  await until(36);
  await api.post("/api/preview/status", { data: { status: "making" } });
  await expect(page.getByRole("heading", { name: "Made just for you" })).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => scrollTo(0, 0));
  await caption("02 / Live status, from the server", "The fixture simulator changes the barista state. The guest screen discovers it through the same HTTP adapter used by production routes.");
  await until(51);
  await api.post("/api/preview/status", { data: { status: "ready" } });
  await expect(page.getByRole("heading", { name: "Your drinks are ready!" })).toBeVisible({ timeout: 10000 });
  await caption("03 / Ready alert", "A prominent ready message, optional tap-enabled sound and supported vibration. Keep the page open: background, locked and muted-phone alerts are not guaranteed.");
  await until(68);
  await page.goto("/ready"); await expect(page.getByText("Jamie", { exact: true })).toBeVisible();
  await caption("04 / Public ready board", "Ready first names and order numbers only. Collection removes the entry; disconnected views hide names and label the last known state.");
  await until(82);
  await api.post("/api/preview/status", { data: { status: "collected" } });
  await expect(page.getByText("Jamie", { exact: true })).toHaveCount(0, { timeout: 10000 });
  await caption("05 / Collection clears the board", "Jamie has been collected and disappears on the next poll. No drink prices, order details or guest contact information are exposed here.");
  await until(95);
  await page.goto("/lead/menu"); const price = page.getByRole("textbox", { name: "Price for White Christmas Latte" });
  await expect(price).toHaveValue("6.50");
  await caption("06 / Lead menu controls", "Change item names, prices, modifiers, sold-out and active flags. Existing orders retain the original name and price snapshots.");
  await until(108);
  await context.setOffline(true); await price.fill("7.25");
  await page.locator("form").first().getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved on this tablet", { exact: false })).toBeVisible();
  await caption("07 / Offline save = pending", "Connectivity is disabled in this browser. The preview provider durably stores a fixture operation; the screen explicitly says other devices have not received it. Production uses Person 1's outbox.");
  await until(130);
  await context.setOffline(false);
  await expect.poll(async () => (await (await api.get("/api/menu")).json()).items[0].priceCents).toBe(725);
  await page.reload(); await expect(price).toHaveValue("7.25");
  await caption("08 / Reconnect and reload", "The sample operation reaches the fixture server and is acknowledged once. Reload reads the persisted S$7.25 value. Production receipt/idempotency validation remains a joint acceptance gate.");
  await until(147);
  await page.goto("/lead/reports"); await expect(page.getByText("$24.30", { exact: true })).toBeVisible();
  await caption("09 / Daily report + safe CSV", "26 Nov: 7 recorded cups, S$24.30. Two cancelled cups / S$12.00 are excluded. Unknown tablet B keeps totals provisional. No guest names or tokens in CSV.");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export daily CSV", exact: false }).click(); await download;
  await until(166);
  await page.goto("/");
  await caption("HANDOFF / Actual implementation, clear remaining gates", "Four modules, handlers, tests, wireframes and one-page PDF are ready for integration. Final submission still needs all six deployed modules, a real QR scan, offline order recovery and organiser POS validation.");
  await until(181);
  await context.close();
  const source = await video.path();
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-t", "180", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(output, "person2-walkthrough.mp4")], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("ffmpeg conversion failed");
  await api.dispose(); await browser.close(); console.log("Wrote 180-second labelled preview walkthrough.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
