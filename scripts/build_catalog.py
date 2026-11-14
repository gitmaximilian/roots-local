"""Build and sign a local reference catalog. Input contains no samples."""
import argparse
from contextlib import contextmanager
import csv
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
KNOWN_SCORES = {
    "PGS000001": ("Brustkrebs · PRS77", "Europäische Validierungskohorte", 77),
}

@contextmanager
def open_text(path):
    with path.open("rb") as probe:
        zipped = probe.read(2) == b"\x1f\x8b"
    opener = gzip.open if zipped else Path.open
    with opener(path, "rt" if zipped else "r", encoding="utf-8-sig", newline="") as source:
        yield source

def load_pgs(path):
    metadata = {}
    with open_text(path) as source:
        for line in source:
            if not line.startswith("#"):
                headers = line.rstrip("\r\n").split("\t")
                break
            header = line[1:].strip().split("=", 1)
            if len(header) == 2:
                metadata[header[0]] = header[1]
        else:
            raise ValueError("Scoredatei ohne Tabellenkopf")
        model_id = metadata.get("pgs_id")
        build = metadata.get("HmPOS_build")
        if model_id not in KNOWN_SCORES or build not in ("GRCh37", "GRCh38"):
            raise ValueError("Für dieses Modell oder diesen Build fehlt eine geprüfte Importdefinition")
        rows = csv.DictReader(source, fieldnames=headers, delimiter="\t")
        terms = [
            {"chromosome": row["hm_chr"], "position": int(row["hm_pos"]),
             "effect": row["effect_allele"], "other": row["other_allele"], "weight": float(row["effect_weight"])}
            for row in rows
        ]
    title, population, count = KNOWN_SCORES[model_id]
    if len(terms) != count:
        raise ValueError("Die veröffentlichte Modellgröße stimmt nicht mit der Datei überein")
    return {"id": model_id, "title": title, "population": population, "build": build,
            "source": f"https://www.pgscatalog.org/score/{model_id}/", "terms": terms}

def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "catalog/starter.json")
    parser.add_argument("--add-pgs", metavar="HARMONIZED_TSV", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--license", required=True)
    parser.add_argument("--key", required=True, type=Path, help="Separater privater Ed25519-Schlüssel im PEM-Format")
    parser.add_argument("--openssl", default="openssl", help="OpenSSL 3")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", args.version):
        parser.error("Ungültige Katalogversion")
    data = json.loads(args.input.read_text(encoding="utf-8"))
    data["version"] = args.version
    if args.add_pgs:
        data.setdefault("scores", []).append(load_pgs(args.add_pgs))
    body = compact(data)
    manifest = compact({"schema": 1, "version": args.version, "origin": args.origin, "license": args.license,
                        "builds": ["GRCh37", "GRCh38"], "sha256": hashlib.sha256(body.encode()).hexdigest()})
    with tempfile.TemporaryDirectory() as directory:
        signed = Path(directory) / "manifest"
        signed.write_bytes(manifest.encode())
        signature = subprocess.check_output([args.openssl, "pkeyutl", "-sign", "-rawin", "-in", str(signed), "-inkey", str(args.key)])
    public = subprocess.check_output([args.openssl, "pkey", "-in", str(args.key), "-pubout", "-outform", "DER"])
    prefix = bytes.fromhex("302a300506032b6570032100")
    if not public.startswith(prefix) or len(public) != len(prefix) + 32 or len(signature) != 64:
        raise ValueError("Ed25519 ist für dieses Paket erforderlich")
    with args.output.open("x", encoding="utf-8") as output:
        output.write(compact({"manifest": manifest, "payload": body, "signature": signature.hex()}))
    print(f"Öffentlicher Schlüssel für Roots Local: {public[len(prefix):].hex()}")

if __name__ == "__main__":
    main()
