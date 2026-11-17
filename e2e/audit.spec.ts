import { expect, test } from "@playwright/test";
import { started } from "./startup";

test("finding can be closed by its button and by Escape without losing focus", async ({ page, hasTouch }) => {
  await started(page);
  await page.getByRole("button", { name: "View example", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What your DNA says" })).toBeVisible();
  await page.getByPlaceholder(/Can I drink milk/).fill("Can I drink milk?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const details = page.getByRole("button", { name: "Details and sources" });
  const close = page.getByRole("button", { name: "Close details" });
  await details.focus();
  await details.press("Enter");
  await expect(close).toBeFocused();
  const target = await close.boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(target?.height).toBeGreaterThanOrEqual(44);
  if (hasTouch) await close.tap();
  else await close.click();
  await expect(close).toHaveCount(0);
  await expect(details).toBeFocused();
  await details.press("Enter");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(close).toHaveCount(0);
  await expect(details).toBeFocused();
});

test.describe("first visit with German browser preferences", () => {
  test.use({ locale: "de-DE" });

test("starts in English, preserves the profile on language switch, and restores focus", async ({ page }) => {
  await started(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const search = page.getByRole("button", { name: "Search", exact: true });
  await search.focus();
  await search.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(search).toBeFocused();
  await page.getByRole("button", { name: "View example", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What your DNA says" })).toBeVisible();
  const german = page.getByRole("button", { name: "Deutsch", exact: true });
  await german.focus();
  await german.press("Enter");
  await expect(german).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("heading", { name: "Was deine DNA sagt" })).toBeVisible();
  const menu = page.getByRole("button", { name: "Menü", exact: true });
  if (await menu.isVisible()) {
    await menu.focus();
    await menu.press("Enter");
    await expect(page.getByRole("button", { name: "Menü schließen" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
    await page.setViewportSize({ width: 320, height: 630 });
    await menu.click();
    await page.getByRole("navigation").getByRole("button", { name: /^Kapitel/ }).first().click();
    expect(await page.locator(".content").evaluate((content) => content.scrollWidth - content.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});
});

test("catalog questions abstain on misleading wording and PDF medical content is opt-in", async ({ page }) => {
  await started(page);
  await page.getByRole("button", { name: "View example", exact: true }).click();
  await page.getByPlaceholder(/Can I drink milk/).fill("Does milk raise my risk of melanoma?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".ask-answer")).toContainText(/no (catalog )?rule|no rule.*catalog/i);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const go = async (name: string) => {
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
  };
  await go("Medicine pass");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await go("PDF report");
  await expect(page.getByRole("checkbox", { name: /Include medical findings/ })).not.toBeChecked();
  await go("Data sources");
  await page.getByRole("button", { name: "Close session" }).click();
  await expect(page.getByRole("button", { name: "View example" })).toBeVisible();
});

test("checksum navigation returns the manifest after the worker takes control", async ({ page }) => {
  await started(page);
  const response = await page.goto("/SHA256SUMS");
  expect(response?.ok()).toBe(true);
  expect(await response?.text()).toMatch(/^[0-9a-f]{64} {2}_headers/m);
});
