import { expect, type Page } from "@playwright/test";

export async function started(page: Page) {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state), {
      message: "The service worker should activate after caching the app",
      timeout: 45_000,
    })
    .toBe("activated");
  // WebKit can activate the worker without attaching it to the initial page.
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
  }
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");
  await expect(page.locator("html")).toHaveAttribute("data-analysis", "ready", { timeout: 60_000 });
  await expect(page.locator("html")).toHaveAttribute("data-pdf", "ready", { timeout: 90_000 });
  await expect(page.locator("html")).toHaveAttribute("data-preview", "ready", { timeout: 30_000 });
}
