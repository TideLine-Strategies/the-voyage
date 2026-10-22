import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env["FACTORY_TEST_URL"] ?? "http://127.0.0.1:5196";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  maxFailures: 1,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  use: { baseURL, trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } },
    },
    { name: "mobile-safari", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  ...(process.env["FACTORY_TEST_URL"]
    ? {}
    : {
        webServer: {
          command: "npm run dev -- --port 5196 --strictPort",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120000,
        },
      }),
  reporter: [["list"], ["json", { outputFile: "test-results/browser-results.json" }]],
});
