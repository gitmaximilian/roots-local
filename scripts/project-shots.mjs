// Screenshots for the project page on maximilianauer.at, taken from the real
// web app with the synthetic example profile and the English interface.
// Usage: node scripts/project-shots.mjs <output dir> [base URL]
import { chromium, webkit, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "output/project";
const base = process.argv[3] ?? "http://127.0.0.1:4173/";
mkdirSync(out, { recursive: true });

async function open(browser, options, scheme) {
  const context = await browser.newContext({ ...options, colorScheme: scheme, locale: "en-US" });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector("html[data-pdf=ready]");
  await page.getByRole("button", { name: "View example" }).first().click();
  await page.getByRole("heading", { name: "What your DNA says" }).waitFor();
  return { context, page };
}
const shot = (page, name) =>
  page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 88, caret: "initial" });
const nav = async (page, label, phone = false) => {
  if (phone) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(500);
};

const desktop = await chromium.launch();
const wide = { viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1.8 };
for (const scheme of ["light", "dark"]) {
  const { context, page } = await open(desktop, wide, scheme);
  await page.waitForTimeout(500);
  await shot(page, `rootslocal-desktop-${scheme}`);
  if (scheme === "light") {
    await nav(page, "Atlas");
    await shot(page, "rootslocal-atlas-light");
  } else {
    await nav(page, "Medicine pass");
    await page.getByRole("button", { name: "Show", exact: true }).first().click();
    await page.waitForTimeout(400);
    await shot(page, "rootslocal-pass-dark");
  }
  await context.close();
}
await desktop.close();

const phone = await webkit.launch();
for (const scheme of ["light", "dark"]) {
  const { context, page } = await open(phone, devices["iPhone 15"], scheme);
  if (scheme === "light") {
    await page.waitForTimeout(500);
  } else {
    await page.getByRole("button", { name: "Show", exact: true }).first().click();
    await page.locator(".areas, .area").first().scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(500);
  }
  await shot(page, `rootslocal-iphone-${scheme}`);
  await context.close();
}
await phone.close();
