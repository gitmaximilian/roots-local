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

test("search marks stay inline and the active result stays readable", async ({ page }) => {
  await example(page);
  const search = page.getByRole("button", { name: "Search", exact: true }).first();
  await search.click();
  await page.getByRole("dialog").getByRole("combobox").fill("milk");
  const option = page.getByRole("option").first();
  await expect(option).toHaveAttribute("aria-selected", "true");
  const label = option.locator(".palette-label > span").first();
  const mark = label.locator("mark").first();
  await expect(mark).toBeVisible();
  // A mark inside a line has the line's height, not a row of its own.
  const [line, marked] = [await label.boundingBox(), await mark.boundingBox()];
  expect(marked!.width).toBeLessThan(line!.width);
  expect(line!.height).toBeLessThan(marked!.height * 1.8);
  // Detail text on the active result uses the result's own text colour.
  const colours = await option.evaluate((button) => {
    const small = button.querySelector("small");
    return [getComputedStyle(button).color, small && getComputedStyle(small).color];
  });
  if (colours[1]) expect(colours[1]).toBe(colours[0]);
});

test("positions use the number format of the interface language", async ({ page }) => {
  await example(page);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation").getByRole("button", { name: "Atlas", exact: true }).click();
  await page.getByLabel("Choose chromosome").selectOption("2");
  await expect(page.locator(".atlas-side")).toContainText("136,608,646");
  await expect(page.locator(".atlas-side")).not.toContainText("136.608.646");
});
