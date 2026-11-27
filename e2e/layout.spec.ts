// Layout regressions found in the design review.
import { expect, test } from "@playwright/test";
import { started } from "./startup";

async function example(page: import("@playwright/test").Page) {
  await started(page);
  await page.getByRole("button", { name: /^(View example|Beispiel ansehen)$/ }).first().click();
  await expect(page.getByRole("heading", { name: /What your DNA says|Was deine DNA sagt/ })).toBeVisible();
}

test("overview figures keep their height at common window sizes", async ({ page }, info) => {
  if (!info.project.use.isMobile) await page.setViewportSize({ width: 1440, height: 900 });
  await example(page);
  const figures = page.locator(".stats > div");
  await expect(figures).toHaveCount(4);
  for (const figure of await figures.all()) {
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toBeVisible();
    expect((await figure.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  }
});
