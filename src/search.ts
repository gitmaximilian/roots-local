// Local search for findings, questions, genes, markers, chapters, and commands.
//
// Everything runs in the page; queries never leave the device. Matching is
// forgiving (accents, umlauts, small typos, word prefixes) and understands
// everyday words in English and German ("milk", "Blutverdünner", "coffee"),
// which are mapped to the genes the catalog has rules for. Ranking prefers
// titles and documented questions over gene names and descriptions.

/** Lowercase, strip accents, fold ß, keep letters, digits, `*`, `:` and `-`. */
export function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9*:\-]+/g, " ")
    .trim();
}

const STOP = new Set(
  (
    "a an and are am be can could do does for from have how i in is it me my of on or the to what which " +
    "who why will with you your " +
    "aber auch bei bin das dem den der des die du ein eine einen einer es fur habe hat ich ihr im in ist " +
    "kann mein meine mich mir mit oder sind und von was welche welcher welches wie wo zu"
  ).split(" "),
);

/** Question words that may stay unmatched without failing the search. */
const OPTIONAL = new Set(
  (
    "tolerate tolerated need get got does work works break down metabolize metabolise process " +
    "likely probably really much more less know tell show find gene genes dna " +
    "vertrage vertragt brauche bekomme bekommt wirkt wirken baue abbauen ab verarbeite " +
    "eher wahrscheinlich wirklich viel mehr weniger sagt sagen zeigt zeig finde gen gene dna"
  ).split(" "),
);

export function tokens(value: string): string[] {
  return fold(value)
    .split(" ")
    .filter((token) => token.length > 0 && !STOP.has(token));
}

/**
 * Everyday words, in English and German, for the topics the catalog covers.
 * Each entry lists genes; a query word that matches a term also matches
 * every finding that tests one of these genes.
 */
const TOPICS: { genes: string[]; terms: string[] }[] = [
  { genes: ["LCT", "MCM6"], terms: ["milk", "milch", "dairy", "lactose", "laktose", "lactase", "laktase", "cheese", "kase", "joghurt", "yogurt"] },
  { genes: ["ABCC11"], terms: ["earwax", "ohrenschmalz", "cerumen", "sweat", "schweiss", "body odor", "korpergeruch", "deodorant"] },
  { genes: ["ACTN3"], terms: ["sprint", "sprinter", "muscle", "muskel", "muskulatur", "endurance", "ausdauer", "sport", "power", "kraft", "running", "laufen"] },
  { genes: ["TAS2R38"], terms: ["bitter", "ptc", "broccoli", "brokkoli", "kohl", "cabbage", "taste", "geschmack", "schmecken"] },
  { genes: ["OR6A2"], terms: ["cilantro", "coriander", "koriander", "soap", "seife", "seifig"] },
  { genes: ["ALDH2", "ADH1B"], terms: ["alcohol", "alkohol", "wine", "wein", "beer", "bier", "flush", "flushing", "rote haut", "red face", "hangover", "kater"] },
  { genes: ["CYP1A2"], terms: ["coffee", "kaffee", "caffeine", "koffein", "espresso", "tea", "tee"] },
  { genes: ["HERC2", "OCA2"], terms: ["eye", "eyes", "auge", "augen", "augenfarbe", "eye colour", "eye color", "blue", "blau", "brown", "braun"] },
  { genes: ["MC1R"], terms: ["red hair", "rote haare", "rothaarig", "ginger", "freckles", "sommersprossen", "sunburn", "sonnenbrand"] },
  { genes: ["TCHH"], terms: ["curly", "lockig", "locken", "straight hair", "glatte haare", "hair shape", "haarform"] },
  { genes: ["MC1R", "TCHH", "HERC2", "OCA2"], terms: ["hair", "haar", "haare", "appearance", "aussehen", "pigment", "pigmentation"] },
  { genes: ["TCF7L2"], terms: ["diabetes", "zucker", "blood sugar", "blutzucker", "insulin"] },
  { genes: ["HFE"], terms: ["iron", "eisen", "hemochromatosis", "hamochromatose", "ferritin"] },
  { genes: ["SLCO1B1"], terms: ["statin", "statine", "simvastatin", "atorvastatin", "cholesterol", "cholesterin", "muscle pain", "muskelschmerzen"] },
  { genes: ["F5", "F2"], terms: ["thrombosis", "thrombose", "clot", "blood clot", "blutgerinnsel", "gerinnung", "clotting", "pill", "pille", "contraceptive", "verhutung", "factor v", "faktor v", "leiden", "prothrombin", "embolism", "embolie"] },
  { genes: ["APOE"], terms: ["alzheimer", "alzheimers", "dementia", "demenz", "memory", "gedachtnis", "apoe4", "e4"] },
  { genes: ["CYP2C9", "VKORC1"], terms: ["warfarin", "coumadin", "marcoumar", "phenprocoumon", "blood thinner", "blutverdunner", "anticoagulant", "gerinnungshemmer"] },
  { genes: ["CYP2C9"], terms: ["ibuprofen", "nsaid", "diclofenac", "celecoxib", "painkiller", "schmerzmittel"] },
  { genes: ["CYP2C19"], terms: ["clopidogrel", "plavix", "omeprazole", "omeprazol", "pantoprazole", "pantoprazol", "ssri", "citalopram", "escitalopram", "sertraline", "antidepressant", "antidepressivum"] },
  { genes: ["TPMT", "NUDT15"], terms: ["azathioprine", "azathioprin", "mercaptopurine", "mercaptopurin", "thiopurine", "thiopurin", "thioguanine", "crohn", "colitis", "leukemia", "leukamie"] },
  { genes: ["DPYD"], terms: ["fluorouracil", "5-fu", "5fu", "capecitabine", "capecitabin", "chemotherapy", "chemotherapie", "chemo"] },
  { genes: ["CYP3A5"], terms: ["tacrolimus", "transplant", "transplantation", "immunosuppressant"] },
  { genes: ["CYP2C9", "CYP2C19", "TPMT", "NUDT15", "DPYD", "CYP3A5", "VKORC1", "SLCO1B1"], terms: ["medicine", "medicines", "medication", "medikament", "medikamente", "drug", "drugs", "arzneimittel", "pharmacogenetics", "pharmakogenetik", "dose", "dosis"] },
];

const topicIndex = TOPICS.flatMap(({ genes, terms }) =>
  terms.map((term) => ({ words: fold(term).split(" "), genes })),
);

/** Damerau–Levenshtein distance, stopping early above `limit`. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = value;
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
  }
  return rows[a.length][b.length];
}

/** How well one query word matches one indexed word: 1 exact, 0.8 prefix, 0.6 typo. */
function wordScore(query: string, word: string): number {
  if (query === word) return 1;
  if (query.length >= 2 && word.startsWith(query)) return 0.8;
  if (query.length < 4) return 0;
  const limit = query.length >= 8 ? 2 : 1;
  if (distance(query, word, limit) <= limit) return 0.6;
  // A typo in a word that is still being typed: compare with the word's start.
  if (word.length > query.length && distance(query, word.slice(0, query.length), limit) <= limit) {
    return 0.5;
  }
  return 0;
}

export type SearchDoc<T> = {
  id: string;
  group: SearchGroup;
  /** Weighted texts; titles and questions should weigh more than descriptions. */
  fields: { text: string; weight: number }[];
  /** Gene symbols and rsIDs, matched exactly and through everyday words. */
  genes?: string[];
  markers?: string[];
  value: T;
};

export type SearchGroup = "answer" | "finding" | "question" | "marker" | "chapter" | "command";

export type Hit<T> = { doc: SearchDoc<T>; score: number };

type Prepared<T> = {
  doc: SearchDoc<T>;
  fields: { words: string[]; weight: number }[];
  genes: Set<string>;
  markers: Set<string>;
};

export function prepare<T>(docs: SearchDoc<T>[]): Prepared<T>[] {
  return docs.map((doc) => ({
    doc,
    fields: doc.fields.map(({ text, weight }) => ({ words: fold(text).split(" "), weight })),
    genes: new Set((doc.genes ?? []).flatMap((gene) => fold(gene).split(" "))),
    markers: new Set((doc.markers ?? []).map(fold)),
  }));
}

/** Genes named by everyday words in the query, with the words they consumed. */
function topicGenes(words: string[]): { genes: Set<string>; used: Set<number> } {
  const genes = new Set<string>();
  const used = new Set<number>();
  for (const { words: phrase, genes: topicGenes } of topicIndex) {
    for (let start = 0; start + phrase.length <= words.length; start++) {
      const matches = phrase.every(
        (part, offset) => wordScore(words[start + offset], part) >= (part.length < 4 ? 1 : 0.6),
      );
      if (!matches) continue;
      topicGenes.forEach((gene) => genes.add(fold(gene)));
      phrase.forEach((_, offset) => used.add(start + offset));
    }
  }
  return { genes, used };
}

/**
 * Ranks documents for a query. Every query word must match something in a
 * document: a word in a field, a gene or rsID, or an everyday term for one of
 * the document's genes.
 */
export function search<T>(query: string, index: Prepared<T>[], limit = 30): Hit<T>[] {
  const words = tokens(query);
  if (!words.length) return [];
  const topics = topicGenes(words);
  const hits: Hit<T>[] = [];
  for (const entry of index) {
    let total = 0;
    let complete = true;
    const topical =
      topics.genes.size > 0 && [...entry.genes].some((gene) => topics.genes.has(gene));
    words.forEach((word, position) => {
      let best = 0;
      if (entry.markers.has(word) || entry.genes.has(word)) best = 3;
      for (const field of entry.fields) {
        for (const candidate of field.words) {
          const score = wordScore(word, candidate);
          if (score) best = Math.max(best, score * field.weight);
        }
      }
      if (!best && topical && topics.used.has(position)) best = 1.5;
      if (!best && !OPTIONAL.has(word)) complete = false;
      total += best;
    });
    if (!complete || total === 0) continue;
    const counted = words.filter((word) => !OPTIONAL.has(word)).length || words.length;
    hits.push({ doc: entry.doc, score: total / counted + (topical ? 0.5 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** A best answer only when it clearly outranks the runner-up. */
export function clearWinner<T>(hits: Hit<T>[]): Hit<T> | undefined {
  const [first, second] = hits;
  if (!first || first.score < 1.2) return undefined;
  if (second && second.doc.value !== first.doc.value && second.score > first.score * 0.85) {
    return undefined;
  }
  return first;
}

/** Splits text into plain and highlighted parts for the query's words. */
export function highlight(text: string, query: string): { text: string; mark: boolean }[] {
  const words = tokens(query).filter((word) => word.length >= 2);
  if (!words.length) return [{ text, mark: false }];
  const parts: { text: string; mark: boolean }[] = [];
  for (const piece of text.split(/(\s+)/)) {
    const folded = fold(piece);
    const mark = !!folded && words.some((word) => folded.startsWith(word) || wordScore(word, folded) >= 0.6);
    const last = parts[parts.length - 1];
    if (last && last.mark === mark) last.text += piece;
    else parts.push({ text: piece, mark });
  }
  return parts;
}
