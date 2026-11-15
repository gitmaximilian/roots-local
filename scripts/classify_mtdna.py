"""Run Haplogrep locally on a single rCRS HSD profile and save a Roots Local summary."""

import argparse
from contextlib import contextmanager
import csv
from hashlib import file_digest
from io import StringIO
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
from zipfile import ZipFile

TOOL_VERSION = "3.3.2"
TREE_VERSION = "17.3"
TREE = f"phylotree-rcrs@{TREE_VERSION}"
TOOL_SHA256 = "957165143ddd7d6ad9f34cc3af56b784fc236081e031c99bea4a574d6ad70959"
TREE_SHA256 = "5278133257f519fb94572eb9e6266ea24b34546cab32f26587700291e0103736"
MAX_PROFILE_BYTES = 1024 * 1024
MT_LENGTH = 16_569


@contextmanager
def verified_archive(path, digest):
    with path.open("rb") as file:
        if file_digest(file, "sha256").hexdigest() != digest:
            raise ValueError("Archive SHA-256 does not match a pinned Haplogrep or PhyloTree release.")
        file.seek(0)
        yield file


def position_count(ranges):
    intervals = []
    for term in filter(None, (term.strip() for term in ranges.split(";"))):
        if not re.fullmatch(r"[0-9]{1,5}(?:-[0-9]{1,5})?", term):
            raise ValueError("The mitochondrial range has an invalid format.")
        first, _, end = term.partition("-")
        start, end = int(first), int(end or first)
        if not 1 <= start <= end <= MT_LENGTH:
            raise ValueError("The mitochondrial range lies outside rCRS.")
        intervals.append((start, end))
    if not intervals:
        raise ValueError("The mitochondrial range is empty.")
    count = last = 0
    for start, end in sorted(intervals):
        count += max(0, end - max(last, start - 1))
        last = max(last, end)
    return count


def stage_profile(path, target):
    with path.open("rb") as handle:
        contents = handle.read(MAX_PROFILE_BYTES + 1)
    if len(contents) > MAX_PROFILE_BYTES:
        raise ValueError("The HSD profile exceeds 1 MiB.")
    rows = [row for row in csv.reader(StringIO(contents.decode("utf-8-sig")), delimiter="\t") if any(row)]
    if rows and rows[0][:3] == ["ID", "Range", "Haplogroup"]:
        rows.pop(0)
    if len(rows) != 1 or len(rows[0]) < 4:
        raise ValueError("Provide a single rCRS HSD profile containing a range and variants.")
    _, ranges, _, *variants = rows[0]
    ranges = ";".join(term.strip() for term in ranges.split(";") if term.strip())
    position_count(ranges)
    variants = " ".join(variants).split()
    if not variants:
        raise ValueError("The HSD profile has no variants.")
    # Strip sample identifiers and the expected haplogroup before classification.
    target.write_text("\t".join(["RootsLocal", ranges, "?", *variants]) + "\n", encoding="utf-8")


def read_tsv(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def classification(result_path):
    hits = read_tsv(result_path)
    checks = read_tsv(result_path.with_suffix(".qc.txt"))
    if not hits or len(hits) > 2 or any(row["SampleID"] != "RootsLocal" for row in hits + checks):
        raise ValueError("Unexpected Haplogrep output for the single profile.")
    candidates = []
    for rank, row in enumerate(sorted(hits, key=lambda row: int(row["Rank"])), start=1):
        quality = float(row["Quality"])
        haplogroup = row["Haplogroup"]
        if int(row["Rank"]) != rank or not 0 <= quality <= 1 or not re.fullmatch(r"[A-Z][A-Za-z0-9_.-]{0,39}", haplogroup):
            raise ValueError("Haplogrep returned an unresolved candidate or an invalid score.")
        candidates.append({"haplogroup": haplogroup, "quality": quality})
    if len(candidates) == 2 and candidates[1]["quality"] > candidates[0]["quality"]:
        raise ValueError("Haplogrep returned inconsistent candidate ranks.")
    if any(row["Type"].lower() not in {"warning", "error"} for row in checks):
        raise ValueError("Haplogrep returned an unknown quality check.")
    return {
        "schema": 1,
        "tool_version": TOOL_VERSION,
        "tree": TREE,
        "covered_positions": position_count(hits[0]["Range"]),
        "candidates": candidates,
        "warnings": sum(row["Type"].lower() == "warning" for row in checks),
        "errors": sum(row["Type"].lower() == "error" for row in checks),
    }


def classify(profile, tool_archive, tree_archive, java):
    with (
        verified_archive(tool_archive, TOOL_SHA256) as tool,
        verified_archive(tree_archive, TREE_SHA256) as tree,
        tempfile.TemporaryDirectory(prefix="roots-mtdna-") as directory,
    ):
        root = Path(directory)
        stage_profile(profile, root / "input.hsd")
        with tarfile.open(fileobj=tool, mode="r:gz") as archive:
            jar = archive.extractfile("haplogrep3.jar")
            with (root / "haplogrep3.jar").open("wb") as target:
                shutil.copyfileobj(jar, target)
        with ZipFile(tree) as archive:
            archive.extractall(root / "reference")
        (root / "haplogrep3.yaml").write_text(
            'repositories: []\nphylotrees:\n  - "reference/tree.yaml"\n', encoding="utf-8"
        )
        execution = subprocess.run(
            [java, "-jar", "haplogrep3.jar", "classify", "--tree", TREE, "--in", "input.hsd",
             "--out", "result.txt", "--hits", "2", "--write-qc"],
            cwd=root, capture_output=True, timeout=120, check=False,
        )
        if execution.returncode:
            raise ValueError("Local Haplogrep could not classify the profile. Verify the rCRS input and Java installation.")
        return classification(root / "result.txt")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--tool-archive", required=True, type=Path)
    parser.add_argument("--tree-archive", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--java", default="java")
    args = parser.parse_args()
    java = shutil.which(args.java)
    if not java:
        parser.error("Java is required to run Haplogrep.")
    try:
        result = classify(args.input, args.tool_archive, args.tree_archive, str(Path(java).resolve()))
        with args.output.open("x", encoding="utf-8") as destination:
            json.dump(result, destination, indent=2, allow_nan=False)
            destination.write("\n")
    except OSError:
        parser.error("A local file could not be read or created, or Java could not be started.")
    except subprocess.TimeoutExpired:
        parser.error("Haplogrep did not finish within two minutes.")
    except (ValueError, KeyError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
