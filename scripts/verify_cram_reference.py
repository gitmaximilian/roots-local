"""Compare Roots Local and HTSlib at two loci in a synthetic indexed CRAM."""

import argparse
from collections import Counter
from hashlib import md5
import json
from pathlib import Path
import subprocess
import sys
import tempfile

from pypdf import PdfReader
import pysam

ROOT = Path(__file__).resolve().parents[1]
SEQUENCE = "ACCTAGGA"
TARGETS = [(2, "rs990000022"), (4, "rs990000024")]


def make_cram(directory):
    reference = directory / "fixture.fa"
    reference.write_text(f">chr22\n{SEQUENCE}\n", encoding="ascii")
    pysam.faidx(str(reference))
    header = {
        "HD": {"VN": "1.6", "SO": "coordinate"},
        "SQ": [
            {"SN": "chr1", "LN": 249250621, "M5": "0" * 32},
            {"SN": "chr2", "LN": 243199373, "M5": "0" * 32},
            {"SN": "chr22", "LN": len(SEQUENCE), "M5": md5(SEQUENCE.encode()).hexdigest()},
        ],
    }
    path = directory / "fixture.cram"
    reads = [
        ("ACCTAGGA", 0, 40, 60),
        ("AGCTAGGA", 0, 40, 60),
        ("ATCTAGGA", 0, 10, 60),
        ("ATCTAGGA", 0, 40, 29),
        ("ATCTAGGA", 1024, 40, 60),
        ("ATCTAGGA", 2048, 40, 60),
        ("ACCTAGGA", 0, 40, 255),
    ]
    with pysam.AlignmentFile(str(path), "wc", header=header, reference_filename=str(reference)) as output:
        for index, (bases, flag, quality, mapq) in enumerate(reads):
            read = pysam.AlignedSegment(output.header)
            read.query_name = f"synthetic-{index}"
            read.query_sequence = bases
            read.flag = flag
            read.reference_id = 2
            read.reference_start = 0
            read.mapping_quality = mapq
            read.cigarstring = "8M"
            read.query_qualities = [quality] * 8
            output.write(read)
    pysam.index(str(path))
    return path, reference


def htslib_counts(cram, reference):
    counts = {}
    with pysam.AlignmentFile(str(cram), "rc", reference_filename=str(reference)) as source:
        for column in source.pileup(
            "chr22", 0, len(SEQUENCE), truncate=True, stepper="samtools",
            min_base_quality=20, min_mapping_quality=30, flag_filter=0xF04,
            compute_baq=False, multiple_iterators=False,
        ):
            counts[column.reference_pos + 1] = Counter(
                entry.alignment.query_sequence[entry.query_position] for entry in column.pileups
                if entry.query_position is not None and entry.alignment.mapping_quality != 255
            )
    return counts


def sign_catalog(directory, openssl):
    key = directory / "key.pem"
    subprocess.run([openssl, "genpkey", "-algorithm", "Ed25519", "-out", key], check=True)
    catalog = json.loads((ROOT / "catalog/starter.json").read_text(encoding="utf-8"))
    catalog["markers"].extend([marker, "Synthetic", "22", position, position, "ACGT"]
                              for position, marker in TARGETS)
    payload = directory / "catalog.json"
    payload.write_text(json.dumps(catalog), encoding="utf-8")
    package = directory / "catalog.rootscat"
    result = subprocess.check_output([
        sys.executable, ROOT / "scripts/build_catalog.py", "--openssl", openssl,
        "--input", payload, "--key", key, "--version", "cram-acceptance",
        "--origin", "Synthetic CRAM acceptance", "--license", "Apache-2.0", "--output", package,
    ])
    return package, result.split()[-1].decode("ascii")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roots-check", type=Path, required=True)
    parser.add_argument("--openssl", default="openssl", help="OpenSSL 3")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="roots-cram-check-") as folder:
        directory = Path(folder)
        cram, reference = make_cram(directory)
        expected = htslib_counts(cram, reference)
        assert expected[2] == {"C": 1, "G": 1}
        assert expected[4] == {"T": 2}
        package, public_key = sign_catalog(directory, args.openssl)
        report = directory / "coverage.pdf"
        subprocess.run([
            args.roots_check.resolve(), ROOT / "fixtures/synthetic-myheritage.txt", report,
            "--synthetic", "--include-calls", "--catalog", package, public_key,
            "--cram", cram, reference,
        ], check=True)
        text = " ".join(" ".join(page.extract_text() for page in PdfReader(report).pages).split())
        for position, marker in TARGETS:
            counts = expected[position]
            evidence = " · ".join(f"{base} {counts[base]}" for base in "ACGT")
            assert f"{marker} · 22:{position} · {sum(counts.values())} bases passing quality filters {evidence}" in text
        print("Roots Local agrees with HTSlib at both synthetic loci.")


if __name__ == "__main__":
    main()
