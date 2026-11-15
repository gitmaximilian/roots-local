// Post-build step for the local-only web app:
// 1. adds Subresource Integrity to every script and stylesheet in index.html,
// 2. writes the service worker with this build's exact file list,
// 3. writes SHA256SUMS for every shipped file.
// Each step reads the files as written, so the hashes match what is served.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] ?? "dist";
const read = (file) => readFileSync(join(root, file));
const walk = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const list = () =>
  walk(root)
    .map((path) => relative(root, path).split("\\").join("/"))
    .sort();

// 1. Subresource Integrity.
let html = read("index.html").toString();
html = html.replace(/<(?:script|link)\b[^>]*>/g, (tag) => {
  const file = tag.match(/\s(?:src|href)="\/([^"]+)"/)?.[1];
  if (!file || !/\.(m?js|css)$/.test(file) || /integrity=/.test(tag)) return tag;
  const digest = createHash("sha384").update(read(file)).digest("base64");
  const extra = ` integrity="sha384-${digest}"${/crossorigin/.test(tag) ? "" : " crossorigin"}`;
  return tag.replace(/\s*\/?>$/, (end) => extra + end);
});
writeFileSync(join(root, "index.html"), html);

// 2. Service worker precache list.
const skip = new Set(["_headers", "sw.js", "SHA256SUMS", "version.txt"]);
const cached = list().filter((file) => !skip.has(file));
const hash = createHash("sha256");
for (const file of cached) hash.update(file).update(read(file));
const version = hash.digest("hex").slice(0, 16);
const urls = cached.map((file) => (file === "index.html" ? "/" : `/${file}`));
const template = readFileSync(new URL("../src/sw.js", import.meta.url), "utf8");
writeFileSync(
  join(root, "sw.js"),
  template.replace("__VERSION__", version).replace("__FILES__", JSON.stringify(urls)),
);
writeFileSync(join(root, "version.txt"), `${version}\n`);

// 3. Checksums.
const files = list().filter((file) => file !== "SHA256SUMS");
writeFileSync(
  join(root, "SHA256SUMS"),
  files
    .map((file) => `${createHash("sha256").update(read(file)).digest("hex")}  ${file}`)
    .join("\n") + "\n",
);
console.log(`build ${version}: ${cached.length} cached files, ${files.length} checksums`);
