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
  await expect(overview.getByRole("button")).toHaveCount(8);
  await overview.screenshot({ path: `test-results/score-overview-${test.info().project.name}.png` });

  await overview.getByRole("button").first().click();
  const inspector = page.locator(".inspector");
  await expect(inspector.getByText(/Estimated percentile/)).toBeVisible();
  await expect(inspector.getByText(/of the score's loci are in your file/)).toBeVisible();
  await expect(inspector.getByText(/Raises the score|Lowers the score/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/score-detail.png" });
  await inspector.getByRole("button", { name: /Close details|Details schließen/ }).click();

  // After the medical opt-in, medical scores join the list.
  await page.getByRole("button", { name: /^(Show|Anzeigen)$/ }).first().click();
  await page.getByRole("button", { name: /I understand, show them|Verstanden, einblenden/ }).click();
  await expect(overview.getByText(/medical scores are hidden/)).toHaveCount(0);
});
