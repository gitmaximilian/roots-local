import { defineConfig, devices } from "@playwright/test";

// The suite runs against the production build served by `vite preview`, so the
// service worker, CSP meta tag, and Subresource Integrity are all in effect.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    acceptDownloads: true,
    actionTimeout: 15_000,
    locale: "en-US",
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
});
