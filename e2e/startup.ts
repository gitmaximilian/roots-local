import { expect, type Page } from "@playwright/test";

export async function started(page: Page) {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-analysis", "ready", { timeout: 60_000 });
  await expect(page.locator("html")).toHaveAttribute("data-pdf", "ready", { timeout: 90_000 });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state), {
      message: "The offline cache should be installed and control the app",
      timeout: 45_000,
    })
    .toBe("activated");
}
