"""Curate publication-level, non-directional marker matches from EBI flat files."""
from bisect import bisect_right
from collections import defaultdict
from contextlib import contextmanager
import csv
from decimal import Decimal, InvalidOperation
import gzip
from io import TextIOWrapper
import json
from pathlib import Path
import re
from zipfile import ZipFile

TOPICS = Path(__file__).resolve().parents[1] / "catalog/gwas_topics.json"
COLUMNS = {
    "PUBMEDID", "STUDY ACCESSION", "MAPPED_TRAIT_URI", "DISEASE/TRAIT",
    "CHR_ID", "CHR_POS", "SNPS", "P-VALUE", "INITIAL SAMPLE SIZE",
}
CHROMS = {str(i) for i in range(1, 23)}
SIGNIFICANCE = Decimal("5e-8")


@contextmanager
def open_table(path):
    with path.open("rb") as probe:
        signature = probe.read(4)
    if signature == b"PK\x03\x04":
        with ZipFile(path) as archive:
            tables = [entry for entry in archive.infolist() if entry.filename.endswith(".tsv")]
            if len(tables) != 1 or tables[0].file_size > 2 * 1024**3:
                raise ValueError("Erwartet wird das EBI-Vollarchiv mit genau einer TSV-Tabelle")
            with TextIOWrapper(archive.open(tables[0]), encoding="utf-8-sig", newline="") as table:
                yield table
    elif signature.startswith(b"\x1f\x8b"):
        with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as table:
            yield table
    else:
        with path.open(encoding="utf-8-sig", newline="") as table:
            yield table


def liftover(path):
    """Use only unique, forward, same-chromosome 1 bp chain alignments."""
    blocks = defaultdict(list)
    with open_table(path) as chain:
        convert = False
        for line in chain:
            fields = line.split()
            if not fields:
                convert = False
                continue
            if fields[0] == "chain":
                _, _, source, _, strand, start, _, target, _, target_strand, query, _, _ = fields
                chrom = source.removeprefix("chr")
                # Keep competing blocks in the index to detect ambiguous mappings.
                convert = strand == "+" and chrom in CHROMS
                source_pos, target_pos = int(start), int(query)
                forward = target == source and target_strand == "+"
            elif convert:
                size, *gaps = map(int, fields)
                blocks[chrom].append((source_pos, source_pos + size, target_pos - source_pos if forward else None))
                if len(gaps) == 2:
                    source_pos += size + gaps[0]
                    target_pos += size + gaps[1]
    index = {}
    for chrom, items in blocks.items():
        items.sort(key=lambda item: item[0])
        maximum = 0
        ends = []
        for _, end, _ in items:
            maximum = max(maximum, end)
            ends.append(maximum)
        index[chrom] = ([item[0] for item in items], ends, items)

    def translate(chrom, pos):
        zero = pos - 1
        starts, ends, items = index.get(chrom, ([], [], []))
        matches = set()
        i = bisect_right(starts, zero) - 1
        while i >= 0 and ends[i] > zero:
            _, end, offset = items[i]
            if end > zero:
                matches.add(offset)
            i -= 1
        if len(matches) == 1:
            offset = matches.pop()
            if offset is not None:
                return pos + offset
        return 0

    return translate


def clean(value, limit):
    value = " ".join((value or "").split())
    return value[:limit - 1] + "…" if len(value) > limit else value


def add_associations(data, path, limit, chain_path=None, topics_path=TOPICS):
    topics = json.loads(topics_path.read_text(encoding="utf-8"))
    translate = liftover(chain_path) if chain_path else lambda chrom, pos: 0
    # A repeated publication/locus/ontology term retains its most significant row.
    associations = defaultdict(dict)
    current = {marker[0]: marker for marker in data["markers"]}
    with open_table(path) as table:
        rows = csv.DictReader(table, delimiter="\t")
        if not COLUMNS.issubset(rows.fieldnames or []):
            raise ValueError("Ungültiger GWAS-Kopf. Benötigt wird der ontologieannotierte EBI-Export v1.0.2.")
        for row in rows:
            terms = (row.get("MAPPED_TRAIT_URI") or "").strip().split(",")
            if len(terms) != 1:
                continue
            term = terms[0].rsplit("/", 1)[-1]
            topic = topics.get(term)
            if not topic:
                continue
            rsid, pmid, accession, chrom, position = (
                (row.get(field) or "").strip() for field in ("SNPS", "PUBMEDID", "STUDY ACCESSION", "CHR_ID", "CHR_POS")
            )
            if not re.fullmatch(r"rs[1-9][0-9]{0,15}", rsid) or not re.fullmatch(r"[1-9][0-9]{0,11}", pmid):
                continue
            if not re.fullmatch(r"GCST[0-9]{6,12}", accession) or chrom not in CHROMS or not position.isascii() or not position.isdigit():
                continue
            if row.get("CNV") not in (None, "", "N") or row.get("MERGED") not in (None, "", "0"):
                continue
            if (reported_id := row.get("SNP_ID_CURRENT")) and f"rs{reported_id}" != rsid:
                continue
            try:
                pos = int(position)
                p = Decimal(row.get("P-VALUE") or "")
                if not p.is_finite() or not (0 < p <= SIGNIFICANCE and 0 < pos <= 250_000_000):
                    continue
            except (ValueError, InvalidOperation):
                continue
            if rsid in current and (current[rsid][2], current[rsid][4]) != (chrom, pos):
                continue
            study = {
                "reported_trait": clean(row.get("DISEASE/TRAIT"), 250) or topic[1],
                "accession": accession,
                "p_value": str(p),
                "effect": clean(row.get("OR or BETA"), 40),
                "effect_context": clean(row.get("95% CI (TEXT)"), 160),
            }
            candidate = (p, accession, pmid, rsid, chrom, pos,
                         clean(row.get("INITIAL SAMPLE SIZE"), 300), study)
            key = (pmid, rsid)
            previous = associations[term].get(key)
            if previous is None or candidate[:-1] < previous[:-1]:
                associations[term][key] = candidate
    added = 0
    for term, candidates in sorted(associations.items()):
        section, name = topics[term]
        accepted = 0
        for _, accession, pmid, rsid, chrom, pos, population, study in sorted(candidates.values(), key=lambda item: item[:-1]):
            if rsid not in current:
                marker = [rsid, "GWAS-Lokus", chrom, translate(chrom, pos), pos, "ACGT"]
                data["markers"].append(marker)
                current[rsid] = marker
            if (current[rsid][2], current[rsid][4]) != (chrom, pos):
                continue
            data["traits"].append({
                "id": f"gwas-{term.lower().replace('_', '-')}-{pmid}-{rsid}",
                "section": section, "title": name, "markers": [rsid], "method": "gwas",
                "evidence": "GWAS-Katalog · statistische Assoziation",
                "summary": "Der Katalog dokumentiert einen Studienzusammenhang an diesem Genomort.",
                "limits": "Der Abgleich prüft den Genomort. Effektallel, Effektrichtung und persönliches Risiko bleiben offen.",
                "population": population or "Im Katalogeintrag nicht angegeben",
                "sources": [[f"Publikation · PMID {pmid}", f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"],
                            [f"GWAS Catalog · {accession}", f"https://www.ebi.ac.uk/gwas/studies/{accession}"]],
                "study": study,
            })
            added += 1
            accepted += 1
            if accepted >= limit:
                break
    if not added:
        raise ValueError("Keine passenden GWAS-Assoziationen gefunden")
    return added
