"""Download the pinned PDF compiler at build time, never at runtime."""
import hashlib
import io
import os
import platform
from pathlib import Path
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

VERSION = "0.15.1"
DIGESTS = {
    "aarch64-apple-darwin": "48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a",
    "aarch64-pc-windows-msvc": "4ab28e1b71ec3184d38d580ab797f499b6770d952b6b19167be5cea5c2662e14",
    "x86_64-pc-windows-msvc": "19ce3551153c2fe7ee9fa2f95208310c8f4d3209fedb699e0333faf8913f6736",
}

def host_target():
    architecture = "aarch64" if platform.machine().lower() in ("arm64", "aarch64") else "x86_64"
    system = {"Darwin": "apple-darwin", "Windows": "pc-windows-msvc"}[platform.system()]
    return f"{architecture}-{system}"

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else host_target()
    windows = target.endswith("windows-msvc")
    extension = ".exe" if windows else ""
    root = Path(__file__).resolve().parents[1]
    destination = root / "src-tauri" / "binaries" / f"typst-{target}{extension}"
    destination.parent.mkdir(exist_ok=True)
    binary_name = "typst" + extension
    archive = f"typst-{target}" + (".zip" if windows else ".tar.xz")
    url = f"https://github.com/typst/typst/releases/download/v{VERSION}/{archive}"
    try:
        with urllib.request.urlopen(url, timeout=90) as request:
            data = request.read()
    except OSError:
        data = subprocess.check_output(["gh", "release", "download", f"v{VERSION}", "--repo", "typst/typst", "--pattern", archive, "-O", "-"])
    if hashlib.sha256(data).hexdigest() != DIGESTS[target]:
        raise ValueError("Typst archive checksum mismatch")
    if windows:
        with zipfile.ZipFile(io.BytesIO(data)) as bundle:
            data = bundle.read(next(name for name in bundle.namelist() if name.split("/")[-1] == binary_name))
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:xz") as bundle:
            member = next(entry for entry in bundle if entry.isfile() and entry.name.split("/")[-1] == binary_name)
            with bundle.extractfile(member) as stream:
                data = stream.read()
    temporary = destination.with_suffix(".download")
    temporary.write_bytes(data)
    os.chmod(temporary, 0o755)
    temporary.replace(destination)
    print(destination)

if __name__ == "__main__":
    main()
