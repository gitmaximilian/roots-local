// One cold run and one warm navigation per origin, with a generated synthetic file.
import { chromium } from "@playwright/test";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const origins = process.argv.slice(2);
if (!origins.length) throw new Error("Pass the baseline and candidate URLs.");
const directory = mkdtempSync(join(tmpdir(), "roots-perf-"));
const sample = readFileSync("fixtures/synthetic-myheritage.txt", "utf8");
const synthetic = join(directory, "synthetic-700k.csv");
const rows = Array.from({ length: 700_000 }, (_, i) => "local" + i + ",1," + (i + 1) + ",AA\n");
writeFileSync(synthetic, sample.trimEnd() + "\n" + rows.join(""));
const browser = await chromium.launch();
try {
  for (const origin of origins) {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    let analysis;
    page.on("worker", (worker) => { if (/\/worker-/.test(worker.url())) analysis = worker; });
    const ready = (part) => page.locator("html[data-" + part + "=ready]").waitFor({state:"attached"});
    const since = (t) => Math.round(performance.now() - t);
    const start = performance.now();
    await page.goto(origin);
    await ready("analysis");
    const coldAnalysis = since(start);
    await ready("pdf");
    const coldPdf = since(start);
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");
    const cached = since(start);
    const reload = performance.now();
    await page.reload();
    await ready("analysis");
    const warmAnalysis = since(reload);
    await ready("pdf");
    const warmPdf = since(reload);
    const picker = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open DNA file", exact: true }).click();
    const picked = await picker;
    const importStart = performance.now();
    await picked.setFiles(synthetic);
    await page.getByRole("heading", { name: "What your DNA says" }).waitFor();
    const importMs = since(importStart);
    await page.getByRole("navigation").getByRole("button", { name: "PDF report" }).click();
    const pdfStart = performance.now();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Export PDF/ }).click();
    await download;
    const pdfMs = since(pdfStart);
    const wasmBytes = await analysis?.evaluate(() => globalThis.rootsMemory());
    console.log(JSON.stringify({ origin, coldAnalysis, coldPdf, cached, warmAnalysis, warmPdf, importMs, pdfMs, wasmBytes }));
    await context.close();
  }
} finally {
  await browser.close();
  rmSync(directory, {recursive:true,force:true});
}
