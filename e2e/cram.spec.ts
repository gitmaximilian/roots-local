// CRAM coverage in the browser: the CRAM, FASTA, and .fai are picked together
// and read in slices by the worker. The synthetic files come from the
// roots-core unit test run with ROOTS_KEEP_CRAM=fixtures/cram.
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { started } from "./startup";

const directory = fileURLToPath(new URL("../fixtures/cram/", import.meta.url));
const files = ["synthetic.cram", "reference.fa", "reference.fa.fai"].map((name) => directory + name);

test("decodes a local CRAM with its FASTA without any request", async ({ page, context }) => {
  test.skip(!files.every(existsSync), "run the roots-core tests with ROOTS_KEEP_CRAM=fixtures/cram first");
  await started(page);
  const requests: string[] = [];
  // WebKit reports reading slices of the picked files as blob: loads; those
  // are local reads, not network requests.
  context.on("request", (request) => {
    if (!/^(blob|data):/.test(request.url())) requests.push(request.url());
  });
  await page.getByRole("button", { name: "View example" }).first().click();
  await expect(page.getByRole("heading", { name: "What your DNA says" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1000) < 700) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Data sources" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open CRAM" }).click();
  await (await chooser).setFiles(files);
  await expect(page.getByText(/GRCh37 · 4 Reads/)).toBeVisible();
  expect(requests).toEqual([]);
});
