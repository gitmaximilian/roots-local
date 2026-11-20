"""Build per-trait genetic scores from the NHGRI-EBI GWAS Catalog.

For every curated trait in catalog/gwas_score_topics.json the builder takes the
single study with the most usable genome-wide significant associations, so that
all weights share one unit, keeps independent lead variants (one per 500 kb),
and resolves each reported risk allele to the GRCh38 plus strand with Ensembl.
Strand-symmetric (A/T, C/G) and multi-allelic variants are dropped.

  python3 scripts/gwas_scores.py select <associations.zip> <selected.json>
  python3 scripts/gwas_scores.py resolve <selected.json> <ensembl-cache.json>
  python3 scripts/gwas_scores.py build <selected.json> <ensembl-cache.json> <output.json> <release>

Only public reference data is read or written.
"""
from collections import defaultdict
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gwas_catalog import open_table, clean  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TOPICS = ROOT / "catalog/gwas_score_topics.json"
CHROMS = {str(i) for i in range(1, 23)}
WINDOW = 500_000
ALTERNATE_WINDOW = 250_000
ALTERNATES = 4
# Reported traits from derived or proxy analyses, used only without a direct study.
DERIVED = re.compile(r"MTAG|multi-trait|multivariate|machine learning|liability|proxy|first degree|principal component", re.I)
MAX_VARIANTS = 2_000
MIN_VARIANTS = 5
COMPLEMENT = str.maketrans("ACGT", "TGCA")
# EFO terms that name a condition rather than a measurement.
DISEASE_TERMS = {"EFO_0000266", "EFO_0003913", "EFO_0009959", "EFO_0000195", "EFO_0009260"}


def weight(row):
    """Signed per-allele effect on the log-odds or trait scale, or None."""
    try:
        value = float(row.get("OR or BETA") or "")
    except ValueError:
        return None, None
    if not math.isfinite(value) or value <= 0:
        return None, None
    text = (row.get("95% CI (TEXT)") or "").lower()
    if "increase" in text and "decrease" not in text:
        return value, "beta"
    if "decrease" in text and "increase" not in text:
        return -value, "beta"
    if "increase" in text or "decrease" in text or value == 1:
        return None, None
    # No unit text: the catalog reports an odds ratio for the risk allele.
    return math.log(value), "or"


def select(archive, output):
    topics = json.loads(TOPICS.read_text(encoding="utf-8"))
    rows_by_study = defaultdict(lambda: defaultdict(dict))
    names, meta = {}, {}
    with open_table(Path(archive)) as table:
        import csv
        for row in csv.DictReader(table, delimiter="\t"):
            terms = (row.get("MAPPED_TRAIT_URI") or "").strip().split(",")
            if len(terms) != 1:
                continue
            term = terms[0].rsplit("/", 1)[-1]
            if term not in topics:
                continue
            names[term] = row.get("MAPPED_TRAIT")
            rsid = (row.get("SNPS") or "").strip()
            risk = (row.get("STRONGEST SNP-RISK ALLELE") or "").strip()
            chrom, pos = (row.get("CHR_ID") or "").strip(), (row.get("CHR_POS") or "").strip()
            accession = (row.get("STUDY ACCESSION") or "").strip()
            if not re.fullmatch(r"rs[1-9][0-9]{0,15}", rsid) or chrom not in CHROMS or not pos.isdigit():
                continue
            if not risk.startswith(rsid + "-") or risk[len(rsid) + 1:] not in ("A", "C", "G", "T"):
                continue
            if row.get("CNV") not in (None, "", "N") or row.get("MERGED") not in (None, "", "0"):
                continue
            if not re.fullmatch(r"GCST[0-9]{6,12}", accession):
                continue
            try:
                p = float(row.get("P-VALUE") or "")
            except ValueError:
                continue
            mlog = float(row.get("PVALUE_MLOG") or 0) if (row.get("PVALUE_MLOG") or "").replace(".", "", 1).isdigit() else 0
            if not (p <= 5e-8 and (p > 0 or mlog > 7.3)):
                continue
            w, kind = weight(row)
            if w is None:
                continue
            try:
                freq = float(row.get("RISK ALLELE FREQUENCY") or "")
                freq = freq if 0 < freq < 1 else None
            except ValueError:
                freq = None
            key = rsid
            gene = clean((row.get("MAPPED_GENE") or "").replace(" - ", "–"), 60)
            entry = (mlog or -math.log10(p) if p > 0 else mlog, rsid, chrom, int(pos), risk[-1], w, kind, freq, gene)
            previous = rows_by_study[term][accession].get(key)
            if previous is None or entry[0] > previous[0]:
                rows_by_study[term][accession][key] = entry
            meta[accession] = {
                "pmid": (row.get("PUBMEDID") or "").strip(),
                "author": clean(row.get("FIRST AUTHOR"), 80),
                "year": (row.get("DATE") or "")[:4],
                "journal": clean(row.get("JOURNAL"), 80),
                "trait": clean(row.get("DISEASE/TRAIT"), 200),
                "sample": clean(row.get("INITIAL SAMPLE SIZE"), 300),
            }
    selected = {}
    for term, studies in sorted(rows_by_study.items()):
        def usable(item):
            # Prefer direct analyses that include European participants, then
            # the study with the most rows on a single effect scale.
            accession, rows = item
            kinds = {r[6] for r in rows.values()}
            enough = len(rows) >= MIN_VARIANTS
            european = bool(re.search(r"European|British", meta[accession]["sample"]))
            direct = not DERIVED.search(meta[accession]["trait"])
            return (enough and european and direct, enough and direct, enough and european,
                    len(rows) if len(kinds) == 1 else 0, sum(r[7] is not None for r in rows.values()))
        accession, rows = max(studies.items(), key=usable)
        if len({r[6] for r in rows.values()}) != 1:
            # Mixed effect scales in one study: keep the dominant scale.
            kind = max(("or", "beta"), key=lambda k: sum(r[6] == k for r in rows.values()))
            rows = {k: r for k, r in rows.items() if r[6] == kind}
        kept = []
        for entry in sorted(rows.values(), key=lambda r: -r[0]):
            if all(entry[2] != k[2] or abs(entry[3] - k[3]) > WINDOW for k in kept):
                kept.append(entry)
            if len(kept) >= MAX_VARIANTS:
                break
        if len(kept) < MIN_VARIANTS:
            print(f"skip {term} {names.get(term)}: {len(kept)} independent variants", file=sys.stderr)
            continue
        # Other significant variants of the same study near a lead stand in for
        # it when a genotyping array lacks the lead itself.
        leads = {r[1] for r in kept}
        alternates = defaultdict(list)
        for entry in sorted(rows.values(), key=lambda r: -r[0]):
            if entry[1] in leads:
                continue
            near = [i for i, k in enumerate(kept) if k[2] == entry[2] and abs(k[3] - entry[3]) <= ALTERNATE_WINDOW]
            if near:
                locus = min(near, key=lambda i: abs(kept[i][3] - entry[3]))
                if len(alternates[locus]) < ALTERNATES:
                    alternates[locus].append(entry)
        variants = []
        for locus, lead in enumerate(kept):
            for r in [lead, *alternates[locus]]:
                variants.append([r[1], r[2], r[3], r[4], r[5], r[7], r[8], locus])
        selected[term] = {"name": names[term], "accession": accession, **meta[accession],
                          "kind": kept[0][6], "loci": len(kept), "variants": variants}
        print(f"{term}\t{len(kept)}\t{kept[0][6]}\t{accession}\t{names[term]}", file=sys.stderr)
    missing = sorted(set(topics) - set(selected))
    print("missing topics:", missing, file=sys.stderr)
    Path(output).write_text(json.dumps(selected), encoding="utf-8")


def post(url, ids):
    for attempt in range(6):
        result = subprocess.run(
            ["curl", "-sf", "-X", "POST", url, "-H", "Content-Type: application/json",
             "-H", "Accept: application/json", "-d", json.dumps({"ids": ids})],
            capture_output=True, text=True)
        if result.returncode == 0:
            return json.loads(result.stdout)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Ensembl request failed: {url}")


def resolve(selected_path, cache_path):
    """Fetch GRCh37 position and alleles, then 1000 Genomes frequencies where needed.

    GRCh38 positions come from the catalog itself; alleles are the same on both
    builds. Frequencies are fetched for variants with more than two listed
    alleles or without a study frequency, because those requests are slow.
    """
    from concurrent.futures import ThreadPoolExecutor
    selected = json.loads(Path(selected_path).read_text(encoding="utf-8"))
    cache_file = Path(cache_path)
    cache = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}
    variants = [v for t in selected.values() for v in t["variants"]]
    ids = sorted({v[0] for v in variants})
    no_freq = {v[0] for v in variants if v[5] is None}

    def fetch(batch, pops):
        answer = post("https://grch37.rest.ensembl.org/variation/homo_sapiens" + ("?pops=1" if pops else ""), batch)
        out = {}
        for rsid in batch:
            record = answer.get(rsid) or {}
            entry = dict(cache.get(rsid, {}))
            maps = [m for m in record.get("mappings", [])
                    if m.get("seq_region_name") in CHROMS and m.get("start") == m.get("end")]
            m = maps[0] if len(maps) == 1 else None
            entry["37"] = [m["seq_region_name"], m["start"], m["allele_string"], m.get("strand", 1)] if m else None
            if pops:
                found = {"ALL": {}, "EUR": {}}
                for item in record.get("populations", []):
                    for key in found:
                        if item.get("population") == f"1000GENOMES:phase_3:{key}" and item.get("allele") in ("A", "C", "G", "T"):
                            found[key][item["allele"]] = item.get("frequency")
                entry["pops"] = found
            out[rsid] = entry
        return out

    def run(todo, pops, workers):
        batches = [todo[i:i + 200] for i in range(0, len(todo), 200)]
        print(f"{'frequencies' if pops else 'positions'}: {len(todo)} variants, {len(batches)} requests", file=sys.stderr, flush=True)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for n, result in enumerate(pool.map(lambda b: fetch(b, pops), batches), 1):
                cache.update(result)
                if n % 10 == 0 or n == len(batches):
                    cache_file.write_text(json.dumps(cache), encoding="utf-8")
                    print(f"{n}/{len(batches)}", file=sys.stderr, flush=True)

    run([i for i in ids if "37" not in cache.get(i, {})], False, 4)
    need = [i for i in ids if "pops" not in cache.get(i, {}) and (
        i in no_freq or not cache[i].get("37") or len(cache[i]["37"][2].split("/")) != 2)]
    run(need, True, 6)


def build(selected_path, cache_path, output, release):
    topics = json.loads(TOPICS.read_text(encoding="utf-8"))
    selected = json.loads(Path(selected_path).read_text(encoding="utf-8"))
    cache = json.loads(Path(cache_path).read_text(encoding="utf-8"))
    traits, stats = [], defaultdict(int)
    for term, study in sorted(selected.items(), key=lambda item: (topics[item[0]][0], topics[item[0]][1])):
        section, de, en, clinical = topics[term]
        variants = []
        for rsid, chrom, pos38, risk, w, freq, gene, locus in study["variants"]:
            record = cache.get(rsid, {})
            old = record.get("37")
            new = [chrom, pos38, old[2], old[3]] if old else None
            if not old or old[0] != chrom:
                stats["position"] += 1
                continue
            listed = new[2].split("/")
            # The two alleles observed in 1000 Genomes define the biallelic pair;
            # rare extra alleles listed in dbSNP are ignored.
            observed = {a: f for a, f in (record.get("pops") or {}).get("ALL", {}).items() if f and f > 0}
            if len(observed) == 2 and set(observed) <= set(listed):
                alleles = sorted(observed)
            elif len(listed) == 2 and all(a in ("A", "C", "G", "T") for a in listed) and len(observed) <= 2 \
                    and set(observed) <= set(listed):
                alleles = listed
            else:
                stats["alleles"] += 1
                continue
            if not set(alleles) <= set(old[2].split("/")):
                stats["alleles"] += 1
                continue
            if new[3] != 1 or old[3] != 1:
                stats["strand"] += 1
                continue
            if set(alleles) in ({"A", "T"}, {"C", "G"}):
                stats["symmetric"] += 1
                continue
            effect = risk if risk in alleles else risk.translate(COMPLEMENT)
            if effect not in alleles:
                stats["allele mismatch"] += 1
                continue
            other = alleles[1] if effect == alleles[0] else alleles[0]
            eur = (record.get("pops") or {}).get("EUR", {})
            reference = eur[effect] if effect in eur else (1 - eur[other] if other in eur else None)
            if freq is not None and reference is not None and abs(freq - reference) > 0.25:
                # A large gap suggests a strand or allele error in the catalog row.
                stats["frequency mismatch"] += 1
                continue
            if freq is None:
                if reference is None:
                    stats["frequency"] += 1
                    continue
                freq = reference
            if not 0.005 <= freq <= 0.995:
                stats["rare"] += 1
                continue
            variants.append([rsid, chrom, old[1], new[1], effect, other, round(w, 6), round(freq, 4), gene, locus])
            stats["kept"] += 1
        if len({v[9] for v in variants}) < MIN_VARIANTS:
            stats["traits skipped"] += 1
            continue
        traits.append({
            "id": "score-" + term.lower().replace("_", "-"),
            "term": term, "section": section, "title": de, "title_en": en, "clinical": clinical,
            "disease": term.startswith(("MONDO_", "HP_")) or term in DISEASE_TERMS,
            "kind": study["kind"], "accession": study["accession"], "pmid": study["pmid"],
            "citation": f"{study['author']} · {study['journal']} ({study['year']})",
            "reported_trait": study["trait"], "sample": study["sample"],
            "variants": variants,
        })
    payload = {"release": release, "traits": traits}
    Path(output).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(dict(stats), len(traits), "traits", file=sys.stderr)


if __name__ == "__main__":
    command, *args = sys.argv[1:]
    {"select": select, "resolve": resolve, "build": build}[command](*args)
