// Compare deterministic catalog results with a language model on synthetic cases.
//
//   node scripts/interpretation-benchmark.mjs                 catalog only
//   node scripts/interpretation-benchmark.mjs <ollama-model>  local Ollama model
//   node scripts/interpretation-benchmark.mjs --claude [id]   Claude via the API
//   node scripts/interpretation-benchmark.mjs --export <file> one prompt to paste into any chat
//   node scripts/interpretation-benchmark.mjs --answers <file> score the pasted chat reply
//
// Only synthetic genotypes are sent. The model gets the same file, marker
// metadata and rules as the catalog; each answer is scored against the
// expected category and calls, which are fixed independently of both.
// Claude reads credentials from ANTHROPIC_API_KEY or an `ant auth login` profile.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const flag = process.argv[2];
const useClaude = flag === "--claude";
const exportFile = flag === "--export" ? process.argv[3] : undefined;
const answersFile = flag === "--answers" ? process.argv[3] : undefined;
if ((flag === "--export" || flag === "--answers") && !process.argv[3]) throw new Error("Expected a file name after " + flag + ".");
const model = useClaude ? (process.argv[3] ?? "claude-opus-5-5") : answersFile ? "pasted chat reply" : exportFile ? undefined : flag;
const port = process.env.ROOTS_OLLAMA_PORT ?? "11446";
if (!/^\d{1,5}$/.test(port)) throw new Error("Expected a port number for local Ollama.");
const origin = "http://127.0.0.1:" + port;
const catalog = JSON.parse(readFileSync("catalog/starter.json", "utf8"));
const input = (rows, header = "# reference=GRCh37\n") => header + "RSID,CHROMOSOME,POSITION,RESULT\n" + rows + "\n";
const cases = [
  ["lactase-association", "lactase", input("rs4988235,2,136608646,AG"), "marker_association", ["AG"]],
  ["lactase-wrong-position", "lactase", input("rs4988235,2,135851076,AG"), "unresolved", [null]],
  ["lactase-unknown-build", "lactase", input("rs4988235,2,136608646,AG", ""), "unresolved", [null]],
  ["lactase-conflicting-rows", "lactase", input("rs4988235,2,136608646,AG\nrs4988235,2,136608646,GG"), "unresolved", [null]],
  ["apoe-double-heterozygote", "apoe", input("rs429358,19,45411941,CT\nrs7412,19,45412079,CT"), "unresolved", ["CT", "CT"]],
  ["apoe-missing-marker", "apoe", input("rs429358,19,45411941,CT"), "unresolved", ["CT", null]],
  ["cyp2c9-unphased", "cyp2c9", input("rs1799853,10,96702047,CT\nrs1057910,10,96741053,AC"), "marker_copies", ["CT", "AC"]],
  ["cyp2c19-reference-markers", "cyp2c19", input("rs4244285,10,96541616,GG\nrs12248560,10,96521657,CC"), "marker_copies", ["GG", "CC"]],
  ["tpmt-unphased", "tpmt", input("rs1800460,6,18139228,CT\nrs1142345,6,18130918,CT"), "marker_copies", ["CT", "CT"]],
  ["earwax-23andme-layout", "earwax",
    "# reference human assembly build 37\n# rsid\tchromosome\tposition\tgenotype\nrs17822931\t16\t48258198\tTT\n",
    "marker_association", ["TT"]],
  ["actn3-ancestry-allele-columns", "actn3",
    "#Chromosome positions are relative to human reference build 37.1.\nrsid\tchromosome\tposition\tallele1\tallele2\nrs1815739\t11\t66328095\tC\tT\n",
    "marker_association", ["CT"]],
  ["lactase-no-call", "lactase", input("rs4988235,2,136608646,--"), "unresolved", [null]],
];

const schema = {
  type: "object",
  properties: {
    category: { enum: ["unresolved", "marker_copies", "marker_association"] },
    calls: { type: "array", items: { type: ["string", "null"] } },
    explanation: { type: "string" },
  },
  required: ["category", "calls", "explanation"],
};

const RULES = [
    "Interpret only the requested topic from this synthetic raw DNA file.",
    "Use a marker only if the file declares the reference build and rsID, chromosome, coordinate and alleles agree. Conflicting rows invalidate the call.",
    "Return one category. 'marker_association' means a limited trait association from a validated marker. 'marker_copies' means only observed marker copies, with insufficient evidence for a complete diplotype or metabolizer type. 'unresolved' means the requested finding cannot be concluded.",
    "Respect phase and untyped alleles. Give one brief plain-language explanation without suggesting diagnosis or medication changes.",
    "List the validated calls in reference-marker order, or null for an unsupported call. Sort the two bases alphabetically.",
    "Marker metadata columns are rsID, gene, chromosome, GRCh37 coordinate, GRCh38 coordinate, allowed bases.",
];
const markersFor = (markerIds) => JSON.stringify(markerIds.map((id) => catalog.markers.find((marker) => marker[0] === id)));
const topicOf = (ruleId) => catalog.traits.find((entry) => entry.id === ruleId).title;

async function localLlm(csv, markerIds, topic) {
  const instructions = [...RULES, markersFor(markerIds), "Topic: " + topic, csv].join("\n");
  if (useClaude) return claude(instructions);
  const response = await fetch(origin + "/api/chat", {
    method: "POST",
    body: JSON.stringify({ model, messages: [{ role: "user", content: instructions }],
      format: schema, stream: false, options: { temperature: 0, seed: 21, num_predict: 240 } }),
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error("Ollama error " + response.status + ": " + await response.text());
  return JSON.parse((await response.json()).message.content);
}

const Answer = z.object({
  category: z.enum(["unresolved", "marker_copies", "marker_association"]),
  calls: z.array(z.string().nullable()),
  explanation: z.string(),
});

async function claude(prompt) {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "high", format: zodOutputFormat(Answer) },
    messages: [{ role: "user", content: prompt }],
  });
  // A refusal is recorded as a failed answer; the benchmark never swaps models.
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return { category: "refused", calls: [], explanation: response.stop_reason ?? "" };
  }
  return response.parsed_output;
}

if (exportFile) {
  // Case names hint at the expected answer, so the chat only sees numbers.
  const parts = [
    "# Roots Local interpretation benchmark (synthetic data, no real person)",
    "", "Answer each numbered case independently with these rules:", "", ...RULES.map((rule) => "- " + rule), "",
    "Reply with only a JSON array, one object per case in order:",
    '[{"case": 1, "category": "...", "calls": ["AG"], "explanation": "..."}, ...]', "",
  ];
  cases.forEach(([, ruleId, csv, , ], index) => parts.push(
    "## Case " + (index + 1), "Topic: " + topicOf(ruleId), "Markers: " + markersFor(catalog.traits.find((t) => t.id === ruleId).markers),
    "File:", "```", csv.trimEnd(), "```", ""));
  writeFileSync(exportFile, parts.join("\n"));
  console.log("Wrote " + cases.length + " cases to " + exportFile);
  process.exit(0);
}
let pasted;
if (answersFile) {
  const text = readFileSync(answersFile, "utf8");
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  pasted = JSON.parse(json);
  if (!Array.isArray(pasted) || pasted.length !== cases.length) throw new Error("Expected " + cases.length + " answers in " + answersFile + ".");
}

const work = mkdtempSync(join(tmpdir(), "roots-interpretation-"));
let catalogPasses = 0;
let llmPasses = 0;
const matches = (actual, expected) => actual.category === expected.category
  && JSON.stringify(actual.calls) === JSON.stringify(expected.calls);
try {
  for (const [index, [id, ruleId, csv, category, calls]] of cases.entries()) {
    const rule = catalog.traits.find((entry) => entry.id === ruleId);
    if (!rule) throw new Error("Missing rule: " + ruleId);
    const fixture = join(work, "synthetic.csv");
    const analysis = join(work, "model.json");
    writeFileSync(fixture, csv);
    execFileSync("cargo", ["run", "-q", "--locked", "-p", "roots-core", "--example", "roots-check",
      "--", fixture, join(work, "synthetic.pdf"), "--synthetic", "--short", "--model-json", analysis]);
    const finding = JSON.parse(readFileSync(analysis, "utf8")).findings.find((entry) => entry.id === ruleId);
    const actual = {
      category: !finding.conclusion ? "unresolved" : finding.conclusion.includes("Marker ×") ? "marker_copies" : "marker_association",
      calls: finding.checks.map((check) => check.call),
    };
    const expected = { category, calls };
    const pass = matches(actual, expected);
    catalogPasses += Number(pass);
    const llm = pasted ? { ...pasted.find((answer) => answer.case === index + 1) ?? pasted[index] }
      : model ? await localLlm(csv, rule.markers, rule.title) : null;
    if (llm) llm.calls ??= [];
    if (llm) llm.calls = llm.calls.map((call) => (call ? [...call].sort().join("") : call));
    const llmPass = llm === null ? null : matches(llm, expected);
    llmPasses += Number(llmPass);
    console.log(JSON.stringify({ id, expected, catalog: actual, pass, llm, llmPass }));
  }
  console.log(JSON.stringify({ cases: cases.length, catalogPasses, model: model ?? null, llmPasses: model ? llmPasses : null }));
  process.exitCode = catalogPasses === cases.length ? 0 : 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
