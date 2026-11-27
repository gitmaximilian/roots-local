// Built-in genetic scores appear as findings with an estimated percentile.
// Medical scores join the overview only after the medical opt-in.
import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { started } from "./startup";

const SCORES = fileURLToPath(new URL("../fixtures/synthetic-scores.csv", import.meta.url));

test("shows genetic scores with percentile and coverage", async ({ page }) => {
  test.setTimeout(120_000);
  await started(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^(Open DNA file|DNA-Datei öffnen)/ }).first().click();
  await (await chooser).setFiles(SCORES);
  await expect(page.getByRole("heading", { name: /What your DNA says|Was deine DNA sagt/ })).toBeVisible({ timeout: 60_000 });

  const overview = page.locator(".score-overview");
  await expect(overview.getByRole("heading", { name: "Genetic scores" })).toBeVisible();
  await expect(overview.getByText(/medical scores are hidden/)).toBeVisible();
  // Five scores first, the rest on request.
  await expect(overview.locator(".score-row")).toHaveCount(5);
  await expect(overview.getByText(/^(top|bottom) 10%$/).first()).toBeVisible();
  await expect(overview.getByText(/tends to (higher|lower)/).first()).toBeVisible();
  // Every percentile uses the same face with equal-width digits.
  const faces = await overview.locator(".score-read .num").evaluateAll((items) =>
    items.map((item) => `${getComputedStyle(item).fontFamily}|${getComputedStyle(item).fontVariantNumeric}`));
  expect(new Set(faces).size).toBe(1);
  expect(faces[0]).toContain("tabular-nums");
  await overview.screenshot({ path: `test-results/score-overview-${test.info().project.name}.png` });

  await overview.locator(".score-row").first().click();
  const inspector = page.locator(".inspector");
  // A coarse range, not a precise percentile, and the low confidence stays.
  await expect(inspector.getByText(/Estimated range/)).toBeVisible();
  await expect(inspector.getByText("Low confidence", { exact: true })).toBeVisible();
  await expect(inspector.getByText(/of the score are in your file/)).toBeVisible();
  await expect(inspector.getByText(/Raises the score|Lowers the score/).first()).toBeVisible();
  // For a score the last column says how each locus moves the score.
  await expect(inspector.locator("th", { hasText: /^Effect$/ })).toHaveCount(1);
  await expect(inspector.locator('td[data-label="Effect"]').first()).toBeVisible();
  await expect(inspector.locator("th", { hasText: /^Data quality$/ })).toHaveCount(0);
  await page.screenshot({ path: "test-results/score-detail.png" });
  await inspector.getByRole("button", { name: /Close details|Details schließen/ }).click();

  // After the medical opt-in, medical scores join the list.
  await page.getByRole("button", { name: /^(Show|Anzeigen)$/ }).first().click();
  await page.getByRole("button", { name: /I understand, show them|Verstanden, einblenden/ }).click();
  await expect(overview.getByText(/medical scores are hidden/)).toHaveCount(0);
  await overview.getByRole("button", { name: /^Show all/ }).click();
  expect(await overview.locator(".score-row").count()).toBeGreaterThan(100);
});
