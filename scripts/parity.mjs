// Compares the WebAssembly build the browser loads with the native Rust core:
// the analysis model must be byte-identical and the PDF text identical.
// Usage: node scripts/parity.mjs <python with pypdf>
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const python = process.argv[2] ?? "python3";
const work = mkdtempSync(join(tmpdir(), "roots-parity-"));
globalThis.rootsCancelRequested = () => false;
globalThis.rootsProgress = () => {};

const analysis = await import(join(root, "src/generated/roots_wasm.js"));
await analysis.default({ module_or_path: readFileSync(join(root, "src/generated/roots_wasm_bg.wasm")) });
const pdf = await import(join(root, "src/generated/roots_pdf_wasm.js"));
await pdf.default({ module_or_path: readFileSync(join(root, "src/generated/roots_pdf_wasm_bg.wasm")) });
const fonts = [
  "LibertinusSerif-Regular.otf", "LibertinusSerif-Bold.otf", "LibertinusSerif-Italic.otf",
  "LibertinusSerif-BoldItalic.otf", "LibertinusSerif-Semibold.otf", "LibertinusSerif-SemiboldItalic.otf",
  "DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf", "DejaVuSansMono-Oblique.ttf", "DejaVuSansMono-BoldOblique.ttf",
].map((name) => new Uint8Array(readFileSync(join(root, "fonts", name))));
pdf.load_fonts(fonts);

const session = new analysis.Session();
const webModel = session.import_dna(undefined);

const native = (args) =>
  execFileSync("cargo", ["run", "-q", "--locked", "-p", "roots-core", "--example", "roots-check", "--",
    join(root, "fixtures/synthetic-myheritage.txt"), ...args], { cwd: root, encoding: "utf8" });
const text = (file) =>
  execFileSync(python, ["-c", "import sys\nfrom pypdf import PdfReader\nprint('\\f'.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))", file], { encoding: "utf8" });

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "same" : "DIFFERENT"}  ${label}`);
  if (!ok) failures += 1;
};

native([join(work, "native-en.pdf"), "--synthetic", "--model-json", join(work, "model.json")]);
check("analysis model (findings, conclusions, coverage)", readFileSync(join(work, "model.json"), "utf8") === webModel);

for (const [label, args, options] of [
  ["full report, English", [], { language: "en" }],
  ["full report, German", ["--german"], { language: "de" }],
  ["summary report, English", ["--short"], { language: "en", short: true }],
  ["medicine pass, English", ["--pass"], { language: "en", pass: true }],
]) {
  const nativeFile = join(work, "native.pdf");
  const webFile = join(work, "web.pdf");
  native([nativeFile, "--synthetic", ...args]);
  writeFileSync(webFile, pdf.render(!!options.pass, session.prepare_pdf(JSON.stringify(options))));
  check(label, text(nativeFile) === text(webFile));
}
process.exit(failures ? 1 : 0);
