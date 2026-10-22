import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "live.spec.ts",
  workers: 1,
  maxFailures: 1,
  timeout: 30000,
  use: {
    baseURL: process.env["FACTORY_TEST_ORIGIN"] || "http://127.0.0.1:17902",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-live",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } },
    },
    { name: "mobile-live", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  reporter: [["list"], ["json", { outputFile: "test-results/live-browser-results.json" }]],
});
