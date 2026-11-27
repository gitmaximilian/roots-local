// Checks WCAG AA contrast (4.5:1) for the text and background pairs of the
// design tokens in src/style.css, in the light and the dark scheme.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

function block(start) {
  const from = css.indexOf("{", css.indexOf(start)) + 1;
  let depth = 1, i = from;
  while (depth) { if (css[i] === "{") depth++; if (css[i] === "}") depth--; i++; }
  return css.slice(from, i - 1);
}
function tokens(text) {
  return Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}
const light = tokens(block(":root {"));
const darkBlock = block("@media (prefers-color-scheme: dark)");
const dark = { ...light, ...tokens(darkBlock.slice(darkBlock.indexOf(":root"))) };

function resolve(set, name) {
  let value = set[name];
  for (let i = 0; value?.startsWith("var(") && i < 5; i++) value = set[value.slice(6, -1)];
  assert.match(value ?? "", /^#[0-9a-f]{6}$/i, `--${name} should resolve to a hex colour`);
  return value;
}
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const pairs = [
  ...["bg", "surface", "elevated"].flatMap((bg) =>
    ["ink", "muted", "accent", "result", "warn", "none"].map((fg) => [fg, bg])),
  ["accent-ink", "accent"],
  ["ink", "accent-soft"], ["ink", "result-soft"], ["warn", "warn-soft"], ["danger", "danger-soft"],
  ...["base-a", "base-c", "base-g", "base-t"].map((bg) => ["base-chip-ink", bg]),
];

for (const [scheme, set] of [["light", light], ["dark", dark]]) {
  test(`text contrast meets WCAG AA in the ${scheme} scheme`, () => {
    for (const [fg, bg] of pairs) {
      const value = ratio(resolve(set, fg), resolve(set, bg));
      assert.ok(value >= 4.5, `--${fg} on --${bg}: ${value.toFixed(2)}:1`);
    }
  });
}
