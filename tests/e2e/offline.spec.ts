import { expect, test, type Page } from "@playwright/test";

const LEAD = process.env.E2E_LEAD_PASSWORD ?? "e2e-lead-password";
const BARISTA = process.env.E2E_BARISTA_PASSWORD ?? "e2e-barista-password";

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("username").fill(username);
  await page.getByLabel("password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/ }).click();
}

async function addDrink(page: Page, drink: RegExp, name: string) {
  await page.getByRole("button", { name: drink }).click();
  await page.getByRole("button", { name: /^add/ }).click();
  await page.getByLabel("first name").fill(name);
  await page.getByRole("button", { name: /send to bar/ }).click();
}

test("a warm tablet keeps taking and advancing orders offline, then syncs exactly once", async ({ page, context }) => {
  await signIn(page, "lead", LEAD);
  await page.waitForURL("**/lead");
  await page.goto("/lead/devices");
  await page.getByLabel("label").fill("e2e offline test");
  await page.getByRole("button", { name: "register" }).click();
  await expect(page.getByText(/this tablet is [A-Z]+/)).toBeVisible();
  const prefix = (await page.getByText(/this tablet is [A-Z]+/).textContent())!.match(/is ([A-Z]+)/)![1];
  const shortNo = `${prefix}-001`;

  await page.goto("/orders");
  await expect(page.getByRole("button", { name: /^latte,/ })).toBeVisible();
  // Wait until the offline shell worker controls this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Using the menu saved/)).toBeVisible();
  await addDrink(page, /^latte,/, "Offline Olive");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `order ${shortNo}` })).toBeVisible();
  await expect(dialog.getByText(/syncs when the Wi-Fi is back/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Full navigation while offline is served from the cached shell; data comes from IndexedDB.
  await page.goto("/barista");
  const card = page.getByRole("article").filter({ hasText: "Offline Olive" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /start making/ }).click();
  const decks = () => page.getByRole("region", { name: "making" }).getByText("Offline Olive");
  await expect(decks()).toBeVisible(); // moves only after the IndexedDB commit
  await page.reload();
  await expect(decks()).toBeVisible();
  await expect(page.getByRole("button", { name: /offline · 2 saved/ })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole("button", { name: /Sync status: synced/ })).toBeVisible({ timeout: 30_000 });

  const mine = async () => ((await (await page.request.get("/api/staff/feed")).json()).orders as { shortNumber: string }[]).filter(o => o.shortNumber === shortNo);
  const feed = await mine();
  expect(feed).toHaveLength(1);
  expect(feed[0]).toMatchObject({ shortNumber: shortNo, status: "making", firstName: "Offline Olive" });

  // Replay after reconnect must not duplicate anything.
  await page.reload();
  await expect(page.getByRole("button", { name: /Sync status: synced/ })).toBeVisible({ timeout: 30_000 });
  expect(await mine()).toHaveLength(1);
});

test("guests and baristas cannot reach lead data", async ({ page, request }) => {
  expect((await request.get("/api/lead/reports")).status()).toBe(401);
  expect((await request.get("/api/staff/feed")).status()).toBe(401);
  await signIn(page, "barista", BARISTA);
  await page.waitForURL("**/orders");
  expect((await page.request.get("/api/lead/reports")).status()).toBe(403);
  await page.goto("/lead/menu");
  await expect(page.getByRole("heading", { name: "leads only" })).toBeVisible();
});
