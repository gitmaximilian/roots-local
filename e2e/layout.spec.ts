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
  if (await menu.isVisible()) {
    await page.getByRole("group", { name: "Choose chromosome" }).getByRole("button", { name: /^Chromosome 2,/ }).click();
  } else {
    await page.locator(".atlas-side select").selectOption("2");
  }
  await expect(page.locator(".atlas-side")).toContainText("136,608,646");
  await expect(page.locator(".atlas-side")).not.toContainText("136.608.646");
});

test("overview names each conclusion once and counts consistently", async ({ page }) => {
  await example(page);
  // The count beside Chapters equals results, scores and study hints together.
  const figures = await page.locator(".stats strong").allTextContents();
  const [results, scores, hints] = figures.map(Number);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /^Chapters/ }).locator(".count"))
    .toHaveText(String(results + scores + hints));
  const closeMenu = page.getByRole("button", { name: "Close menu" });
  if (await closeMenu.isVisible()) await closeMenu.click();
  // Every visible conclusion appears exactly once on the overview.
  const answers = await page.locator(".result-answer").allTextContents();
  const content = await page.locator(".content").innerText();
  for (const answer of answers) {
    expect(content.split(answer).length - 1, answer).toBe(1);
  }
  // The medical notice is neutral and keeps the confirmation step.
  const notice = page.locator(".notice-card");
  await expect(notice).toContainText("medical findings hidden");
  const background = await notice.evaluate((el) => getComputedStyle(el).backgroundColor);
  const danger = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--danger-soft").trim());
  expect(background).not.toBe(danger);
  await notice.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("dialog", { name: "Before you show medical topics" })).toBeVisible();
});

test("chapters fold topics without a matching rule into one line", async ({ page }) => {
  await example(page);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /^Chapters/ }).click();
  await expect(page.getByText("No applicable trait rule", { exact: false })).toHaveCount(0);
  const folded = page.locator(".empty-sections summary");
  await expect(folded).toContainText(/more topics? without a matching rule/);
  // The sidebar no longer repeats the chapter list.
  await expect(page.locator(".sidebar nav .group")).not.toContainText(["Chapters"]);
});

test("phone layout: language below the intro, nothing under the dock, list atlas", async ({ page }, info) => {
  test.skip(!info.project.use.isMobile, "phone layout");
  await started(page);
  const heading = await page.getByRole("heading", { name: "Your DNA. Your device." }).boundingBox();
  const language = await page.getByRole("button", { name: "Deutsch", exact: true }).boundingBox();
  expect(language!.y).toBeGreaterThan(heading!.y);
  await page.getByRole("button", { name: "View example", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "What your DNA says" })).toBeVisible();
  // The last element of the page can be scrolled above the dock.
  const content = page.locator(".content");
  await content.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const dock = (await page.getByRole("navigation", { name: "Quick navigation" }).boundingBox())!;
  const last = (await page.locator(".quality-note").boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(dock.y);
  // The overview stays short enough to scan.
  const height = await content.evaluate((el) => el.scrollHeight);
  expect(height).toBeLessThan(page.viewportSize()!.height * 5);
  // Atlas: chromosomes as a list with large targets.
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Atlas" }).click();
  const chromosomes = page.getByRole("group", { name: "Choose chromosome" }).getByRole("button");
  await expect(chromosomes).toHaveCount(24);
  for (const box of await chromosomes.evaluateAll((items) => items.map((i) => i.getBoundingClientRect().height))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: /^Chromosome 2,/ }).click();
  await expect(page.locator(".atlas-side")).toContainText("Chromosome 2");
  await page.locator(".atlas-side button").first().click();
  // Marker rows in the inspector are blocks, not a squeezed table.
  await expect(page.locator(".inspector .marker-table thead")).toBeHidden();
  // Data sources stay reachable from the phone menu.
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Data sources" })).toBeInViewport();
});

test("sources are links and the inspector keeps the chosen entry in view", async ({ page }, info) => {
  test.skip(Boolean(info.project.use.isMobile), "desktop inspector");
  await page.setViewportSize({ width: 1280, height: 800 });
  await example(page);
  const entry = page.locator(".result-list li button").last();
  await entry.scrollIntoViewIfNeeded();
  await entry.click();
  const inspector = page.locator(".inspector");
  await expect(inspector).toBeVisible();
  await expect(entry).toBeInViewport();
  // The answer keeps a readable width next to the open inspector.
  const answer = (await page.locator(".result-list .result-answer").first().boundingBox())!;
  expect(answer.width).toBeGreaterThan(240);
  expect((await inspector.boundingBox())!.width).toBeGreaterThanOrEqual(430);
  const link = inspector.locator(".sources a").first();
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noreferrer/);
  await expect(inspector.getByRole("button", { name: "Copy address" }).first()).toBeVisible();
});

test("variant rows name medical findings only after the medical opt-in", async ({ page }) => {
  await example(page);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Variants" }).click();
  const table = page.locator(".variant-table");
  await expect(table).toContainText("Lactase");
  await expect(table).not.toContainText("Factor V Leiden");
  await expect(table).toContainText("Medical finding, hidden");
  // Genotype letters are readable as text, not only as coloured chips.
  await expect(table.locator(".genotype .sr-only").first()).toHaveText(/^[ACGT]{2}$/);
});

test("keyboard focus stays visible", async ({ page }, info) => {
  test.skip(Boolean(info.project.use.isMobile), "keyboard");
  await example(page);
  // Safari reaches buttons with Option-Tab, other browsers with Tab.
  await page.locator(".result-list li button").first().focus();
  await page.keyboard.press(info.project.name === "webkit" ? "Alt+Tab" : "Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BUTTON");
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!);
    return `${style.outlineStyle} ${style.outlineWidth}`;
  });
  expect(outline).not.toMatch(/^none|0px/);
});

test("ask and radar never overlap, also with the inspector open", async ({ page }, info) => {
  test.skip(!!info.project.use.isMobile, "the phone layout has no radar");
  await example(page);
  for (const width of [1000, 1150, 1280, 1440, 1700]) {
    await page.setViewportSize({ width, height: 900 });
    for (const inspector of [false, true]) {
      if (inspector) await page.locator(".result-list li button").first().click();
      const ask = (await page.locator(".ask").boundingBox())!;
      const radar = (await page.locator(".radar-wrap").boundingBox())!;
      const apart =
        ask.x + ask.width <= radar.x + 1 ||
        radar.x + radar.width <= ask.x + 1 ||
        ask.y + ask.height <= radar.y + 1;
      expect(apart, `${width}px, inspector ${inspector}`).toBe(true);
      // The ask card has room for its question field.
      expect(ask.width, `${width}px, inspector ${inspector}`).toBeGreaterThan(320);
      if (inspector) await page.keyboard.press("Escape");
    }
  }
});
