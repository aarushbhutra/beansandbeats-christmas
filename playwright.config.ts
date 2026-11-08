import { defineConfig } from "@playwright/test";

const port = 3320;
const remote = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: remote ?? `http://127.0.0.1:${port}`,
    serviceWorkers: "allow",
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] } } : {}),
  },
  // Against a deployed URL (PLAYWRIGHT_BASE_URL), no local server is started.
  webServer: remote ? undefined : {
    // Requires `pnpm build` first. Uses an isolated throwaway database.
    command: `rm -rf .data/e2e && pnpm start --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PGLITE_DIR: ".data/e2e",
      DATABASE_URL: "",
      BOOTSTRAP_LEAD_USERNAME: "lead",
      BOOTSTRAP_LEAD_PASSWORD: "e2e-lead-password",
      BOOTSTRAP_BARISTA_USERNAME: "barista",
      BOOTSTRAP_BARISTA_PASSWORD: "e2e-barista-password",
    },
  },
});
