"""Write a synthetic raw data file that covers the lead variant of every score locus.

Genotypes are drawn from the effect-allele frequencies with a fixed seed, so
the file describes no real person. Used to check score rendering end to end.
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
rng = random.Random(20261120)
data = json.loads((ROOT / "catalog/gwas-scores.json").read_text(encoding="utf-8"))
rows, seen = [], set()
for trait in data["traits"]:
    leads = set()
    for rsid, chrom, old, new, effect, other, weight, freq, gene, locus in trait["variants"]:
        if locus in leads or rsid in seen:
            continue
        leads.add(locus)
        seen.add(rsid)
        call = "".join(sorted(effect if rng.random() < freq else other for _ in range(2)))
        rows.append((int(chrom), old, rsid, chrom, call))
rows.sort()
lines = ["# Synthetic example raw data (no real person)", "# reference=GRCh37", "RSID,CHROMOSOME,POSITION,RESULT"]
lines += [f"{rsid},{chrom},{pos},{call}" for _, pos, rsid, chrom, call in rows]
(ROOT / "fixtures/synthetic-scores.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(len(rows), "rows")
