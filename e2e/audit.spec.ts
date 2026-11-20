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
  const mobileMenu = page.getByRole("button", { name: "Menu", exact: true });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  const german = page.getByRole("button", { name: "Deutsch", exact: true });
  await german.focus();
  await german.press("Enter");
  await expect(german).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  const closeMenu = page.getByRole("button", { name: "Menü schließen" });
  if (await closeMenu.isVisible()) await closeMenu.click();
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
  await go("Medicine notes");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Before you show medical topics" })).toBeVisible();
  await page.getByRole("button", { name: "I understand, show them" }).click();
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

test("phone dock, first-use guide, and first-tap controls", async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, "requires a touch browser profile");
  await started(page);
  await page.setViewportSize({ width: 320, height: 650 });
  const dock = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(dock).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Choose your data" })).toBeVisible();
  await page.getByRole("button", { name: "Deutsch", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "Wähle deine Daten" })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).tap();
  const search = page.getByRole("button", { name: "Search", exact: true });
  await search.tap();
  const input = page.getByRole("dialog").getByRole("combobox");
  await expect(input).toBeFocused();
  await input.fill("chapters");
  await page.getByRole("option", { name: /^Chapters/ }).first().tap();
  await expect(input).toBeHidden();
  await dock.getByRole("button", { name: "Overview", exact: true }).tap();
  await page.getByRole("button", { name: "View example", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "What your DNA says" })).toBeVisible();
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Deutsch", exact: true })).toHaveCount(0);
  await dock.getByRole("button", { name: "Menu", exact: true }).tap();
  await expect(page.getByRole("region", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Deutsch", exact: true }).tap();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("stacked chapter navigation scrolls above the chapter text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await started(page);
  const dock = page.getByRole("navigation", { name: "Quick navigation" });
  await dock.getByRole("button", { name: "Chapters", exact: true }).click();
  const list = page.locator(".chapter-list");
  await expect(list).toHaveCSS("position", "static");
  const endBefore = (await list.boundingBox())!.y;
  await page.locator(".content").evaluate((element) => element.scrollTop = 400);
  await expect.poll(async () => (await list.boundingBox())!.y).toBeLessThan(endBefore);
});
