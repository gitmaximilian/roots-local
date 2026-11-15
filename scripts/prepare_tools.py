"""Download the pinned PDF compiler at build time, never at runtime.

Roots Local targets macOS on Apple Silicon only.
"""
import hashlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import urllib.request

VERSION = "0.15.1"
TARGET = "aarch64-apple-darwin"
DIGEST = "48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a"


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else TARGET
    if target != TARGET:
        raise SystemExit(f"Unsupported target {target}. Roots Local builds for {TARGET} only.")
    root = Path(__file__).resolve().parents[1]
    destination = root / "src-tauri" / "binaries" / f"typst-{TARGET}"
    destination.parent.mkdir(exist_ok=True)
    archive = f"typst-{TARGET}.tar.xz"
    url = f"https://github.com/typst/typst/releases/download/v{VERSION}/{archive}"
    try:
        with urllib.request.urlopen(url, timeout=90) as request:
            data = request.read()
    except OSError:
        data = subprocess.check_output(["gh", "release", "download", f"v{VERSION}", "--repo", "typst/typst", "--pattern", archive, "-O", "-"])
    if hashlib.sha256(data).hexdigest() != DIGEST:
        raise ValueError("Typst archive checksum mismatch")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:xz") as bundle:
        member = next(entry for entry in bundle if entry.isfile() and entry.name.split("/")[-1] == "typst")
        with bundle.extractfile(member) as stream:
            data = stream.read()
    temporary = destination.with_suffix(".download")
    temporary.write_bytes(data)
    os.chmod(temporary, 0o755)
    temporary.replace(destination)
    print(destination)


if __name__ == "__main__":
    main()
