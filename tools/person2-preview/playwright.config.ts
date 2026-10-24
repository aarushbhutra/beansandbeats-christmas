import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: "http://127.0.0.1:3202", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: { command: "pnpm dev", url: "http://127.0.0.1:3202", reuseExistingServer: true, timeout: 90000 },
});
