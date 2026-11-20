// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepare, search, clearWinner, fold, highlight } from "../src/search.ts";

const docs = prepare([
  { id: "lactase", group: "finding", value: "lactase", genes: ["MCM6 / LCT"], markers: ["rs4988235"],
    fields: [{ text: "Lactase activity in adulthood", weight: 3 }, { text: "Can I drink milk?", weight: 2.5 }, { text: "Laktaseaktivität im Erwachsenenalter", weight: 3 }] },
  { id: "caffeine", group: "finding", value: "caffeine", genes: ["CYP1A2"], markers: ["rs762551"],
    fields: [{ text: "CYP1A2 and caffeine", weight: 3 }, { text: "How do I tolerate coffee?", weight: 2.5 }] },
  { id: "vkorc1", group: "finding", value: "vkorc1", genes: ["VKORC1"], markers: ["rs9923231"],
    fields: [{ text: "VKORC1 and warfarin", weight: 3 }, { text: "Do I need less warfarin?", weight: 2.5 }] },
  { id: "cyp2c9", group: "finding", value: "cyp2c9", genes: ["CYP2C9"], markers: ["rs1799853", "rs1057910"],
    fields: [{ text: "CYP2C9: two tested markers", weight: 3 }] },
  { id: "hla-dq2", group: "finding", value: "hla-dq2", genes: ["HLA-DQA1"], markers: ["rs2187668"],
    fields: [{ text: "HLA-DQ2.5 and coeliac disease", weight: 3 }] },
  { id: "abcg2", group: "finding", value: "abcg2", genes: ["ABCG2"], markers: ["rs2231142"],
    fields: [{ text: "ABCG2 Q141K, uric acid and gout", weight: 3 }] },
  { id: "asparagus", group: "finding", value: "asparagus", genes: ["OR2M7"], markers: ["rs4481887"],
    fields: [{ text: "Smelling asparagus in urine", weight: 3 }] },
  { id: "export", group: "command", value: "export", fields: [{ text: "Export PDF", weight: 3 }] },
]);
const ids = (query) => search(query, docs).map((hit) => hit.doc.id);

test("folds accents and umlauts", () => {
  assert.equal(fold("Laktaseaktivität Schweiß"), "laktaseaktivitat schweiss");
});
test("everyday words reach the gene", () => {
  assert.equal(ids("Vertrage ich Milch?")[0], "lactase");
  assert.equal(ids("Kaffee")[0], "caffeine");
  assert.deepEqual(new Set(ids("Blutverdünner")), new Set(["vkorc1", "cyp2c9"]));
});
test("everyday words reach the 1.7.0 rules", () => {
  assert.equal(ids("Zöliakie")[0], "hla-dq2");
  assert.equal(ids("Vertrage ich Gluten?")[0], "hla-dq2");
  assert.equal(ids("Gicht")[0], "abcg2");
  assert.equal(ids("Spargel")[0], "asparagus");
});
test("tolerates typos and prefixes", () => {
  assert.equal(ids("lactse")[0], "lactase");
  assert.equal(ids("warfa")[0], "vkorc1");
  assert.equal(ids("exprt pdf")[0], "export");
});
test("finds markers and genes exactly", () => {
  assert.deepEqual(ids("rs4988235"), ["lactase"]);
  assert.equal(ids("cyp2c9")[0], "cyp2c9");
});
test("every word must match", () => {
  assert.deepEqual(ids("milk unicorn"), []);
});
test("a clear winner only when unambiguous", () => {
  assert.equal(clearWinner(search("Can I drink milk", docs))?.doc.id, "lactase");
  assert.equal(clearWinner(search("blood thinner", docs)), undefined);
});
test("highlights matching words", () => {
  assert.deepEqual(highlight("Can I drink milk?", "milk").filter((p) => p.mark).map((p) => p.text.trim()), ["milk?"]);
});
