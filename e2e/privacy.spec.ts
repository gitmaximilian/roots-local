// Proof that Roots Local keeps DNA data on the device.
//
// The tests load the production build, import a synthetic raw data file, open
// every view, and export the full report in English and German, the summary
// report, and the medicine pass. They fail if
// - any request goes to another origin at any time,
// - any request at all happens after start-up (both engines loaded),
// - anything other than the language choice is stored in the browser,
// - the same workflow does not also work completely offline.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { started } from "./startup";

const SAMPLE = fileURLToPath(new URL("../fixtures/synthetic-myheritage.txt", import.meta.url));
const PYTHON = process.env.ROOTS_TEST_PYTHON;
const ORIGIN = new URL(process.env.ROOTS_BASE_URL ?? "http://127.0.0.1:4173").origin;

type Recorded = { url: string; phase: string };

function record(context: BrowserContext) {
  const requests: Recorded[] = [];
  const state = { phase: "start-up" };
  const add = (url: string) => {
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      requests.push({ url, phase: state.phase });
    }
  };
  context.on("request", (request) => add(request.url()));
  // Chromium also reports service-worker-owned requests on the context.
  return { requests, state };
}

async function openFile(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^(Open DNA file|DNA-Datei öffnen)/ }).first().click();
  await (await chooser).setFiles(SAMPLE);
  await expect(page.getByRole("heading", { name: /What your DNA says|Was deine DNA sagt/ })).toBeVisible();
}

async function go(page: Page, label: RegExp) {
  const isPhone = (page.viewportSize()?.width ?? 1000) < 700;
  if (isPhone) {
    await page.getByRole("button", { name: /^(Menu|Menü)$/ }).click();
  }
  await page.getByRole("navigation").getByRole("button", { name: label }).first().click();
}

async function save(page: Page, button: RegExp) {
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: button }).click();
  const file = await download;
  expect(file.url()).toMatch(/^blob:/);
  const path = await file.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  return { path, name: file.suggestedFilename() };
}

function verifyPdf(path: string, language: "en" | "de", source: "file" | "example") {
  if (!PYTHON) return;
  const output = execFileSync(PYTHON, ["scripts/verify_pdf.py", path, language, ...(source === "file" ? ["--imported"] : [])], {
    encoding: "utf8",
  });
  expect(output).toContain("17 chapters, 76 sections");
}

async function workflow(page: Page, source: "file" | "example" = "file") {
  if (source === "file") {
    await openFile(page);
  } else {
    await page.getByRole("button", { name: /^(View example|Beispiel ansehen)$/ }).first().click();
    await expect(page.getByRole("heading", { name: /What your DNA says|Was deine DNA sagt/ })).toBeVisible();
  }
  for (const view of [/Chapters|Kapitel/, /Atlas/, /Variants|Varianten/, /Medicine pass|Medikamentenpass/, /Data sources|Datenquellen/, /Overview|Übersicht/]) {
    await go(page, view);
  }
  // Ask your DNA.
  await page.getByPlaceholder(/Can I drink milk|Kann ich Milch/).fill("Can I drink milk?");
  await page.getByRole("button", { name: /^(Ask|Fragen)$/ }).click();

  await go(page, /PDF report|PDF-Report/);
  const english = await save(page, /^(Export PDF|PDF exportieren)/);
  verifyPdf(english.path, "en", source);
  await page.getByRole("radio", { name: /Summary report/ }).check();
  await save(page, /^(Export PDF|PDF exportieren)/);

  await go(page, /Medicine pass|Medikamentenpass/);
  await page.getByRole("button", { name: /^(Show|Anzeigen)$/ }).first().click();
  const pass = await save(page, /Export pass as PDF|Pass als PDF exportieren/);
  expect(pass.name).toContain("Medicine Pass");

  await page.getByRole("combobox", { name: "Language" }).selectOption("de");
  await go(page, /PDF-Report/);
  await page.getByRole("radio", { name: /Vollreport/ }).check();
  const german = await save(page, /^PDF exportieren/);
  verifyPdf(german.path, "de", source);
}

async function storedData(page: Page) {
  return page.evaluate(async () => {
    const local = Object.keys(localStorage);
    const session = Object.keys(sessionStorage);
    const databases = "databases" in indexedDB ? (await indexedDB.databases()).map((d) => d.name) : [];
    const cached: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) cached.push(`${key} ${new URL(request.url).pathname}`);
    }
    return { local, session, databases, cookie: document.cookie, cached };
  });
}

test("no request after start-up and none to another origin", async ({ page, context }) => {
  const { requests, state } = record(context);
  await started(page);
  state.phase = "after start-up";
  await workflow(page);

  // The recorder sees the worker's own requests: both engines were loaded at start-up.
  for (const engine of ["roots_wasm_bg", "roots_pdf_wasm_bg"]) {
    expect(requests.some((r) => r.phase === "start-up" && r.url.includes(engine)), engine).toBe(true);
  }
  const foreign = requests.filter((r) => new URL(r.url).origin !== ORIGIN);
  expect(foreign, "requests to other origins").toEqual([]);
  const late = requests.filter((r) => r.phase === "after start-up");
  expect(late, "requests after start-up").toEqual([]);

  const stored = await storedData(page);
  expect(stored.local.filter((key) => key !== "roots-local-language")).toEqual([]);
  expect(stored.session).toEqual([]);
  expect(stored.databases).toEqual([]);
  expect(stored.cookie).toBe("");
  // The offline cache holds only the build's own files (from the service worker list).
  const files = await (await page.request.get("/sw.js")).text();
  for (const entry of stored.cached) {
    const [, path] = entry.split(" ");
    expect(files, `unexpected cached ${path}`).toContain(`"${path}"`);
  }
});

test("works offline after the first visit", async ({ page, context, browserName }) => {
  const { requests } = record(context);
  await started(page);
  await context.setOffline(true);
  if (browserName === "webkit") {
    // Playwright's WebKit offline emulation cannot reload a page ("internal
    // error") and also blocks reading picked files. In WebKit the offline run
    // therefore keeps the loaded page and analyzes the built-in example.
    test.info().annotations.push({ type: "note", description: "WebKit: no reload, built-in example" });
    await workflow(page, "example");
  } else {
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-pdf", "ready", { timeout: 90_000 });
    await workflow(page);
  }
  expect(requests.filter((r) => new URL(r.url).origin !== ORIGIN)).toEqual([]);
});

test("retries a failed static file download during offline setup", async ({ page, context, browserName }) => {
  test.skip(
    browserName !== "chromium" || Boolean(process.env.ROOTS_BASE_URL),
    "requires interception of service worker downloads on the local build",
  );
  let attempts = 0;
  await context.route("**/icons/maskable-512.png", async (route) => {
    if (route.request().serviceWorker() && ++attempts === 1) {
      await route.abort("connectionreset");
    } else {
      await route.continue();
    }
  });
  await started(page);
  expect(attempts).toBe(2);
});
