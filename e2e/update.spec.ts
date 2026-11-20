import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

test("a waiting update preserves a second tab until it is closed", async ({ context, page, browserName }, info) => {
  test.skip(browserName !== "chromium" || info.project.name !== "chromium" || !!process.env.ROOTS_BASE_URL,
    "the update is simulated on a separate, local app origin");
  let release = "baseline";
  const dist = resolve("dist");
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".wasm": "application/wasm",
  };
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
      const file = resolve(dist, "." + (path === "/" ? "/index.html" : path));
      if (!file.startsWith(dist + sep)) throw new Error("Invalid path");
      const body = await readFile(file);
      res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(path === "/sw.js" ? body.toString().replace(/const VERSION = "[^"]+";/, `const VERSION = "${release}";`) : body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test address");
    const origin = `http://127.0.0.1:${address.port}/`;
    await page.goto(origin);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");
    const second = await context.newPage();
    await second.goto(origin);
    await second.getByRole("button", { name: "View example", exact: true }).click();
    await expect(second.getByRole("heading", { name: "What your DNA says" })).toBeVisible();
    release = "replacement";
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    const reload = page.getByRole("button", { name: "Reload", exact: true });
    await reload.click();
    await expect(page.getByText("Close your other Roots Local tabs and try again.")).toBeVisible();
    await expect(second.getByRole("heading", { name: "What your DNA says" })).toBeVisible();
    await second.close();
    const navigation = page.waitForEvent("framenavigated");
    await reload.click();
    await navigation;
    await expect.poll(() => page.evaluate(async () => caches.keys())).toEqual(["roots-local-replacement"]);
    await expect(page.getByRole("button", { name: "View example", exact: true })).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((closed) => server.close(() => closed()));
  }
});
