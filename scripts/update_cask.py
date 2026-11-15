"""Set the version and checksum in the Homebrew cask after a release.

Usage: python scripts/update_cask.py <version> <SHA256SUMS file or sha256> [cask path]
"""
from pathlib import Path
import re
import sys


def main():
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    version, checksum = sys.argv[1], sys.argv[2]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise SystemExit("Version must look like 1.2.3")
    if Path(checksum).is_file():
        lines = Path(checksum).read_text(encoding="utf-8").split()
        checksum = lines[0]
    if not re.fullmatch(r"[0-9a-f]{64}", checksum):
        raise SystemExit("Expected a 64-character lowercase SHA-256")
    root = Path(__file__).resolve().parents[1]
    cask = Path(sys.argv[3]) if len(sys.argv) == 4 else root / "packaging/homebrew/Casks/roots-local.rb"
    text = cask.read_text(encoding="utf-8")
    text, versions = re.subn(r'^  version "[^"]*"$', f'  version "{version}"', text, flags=re.M)
    text, sums = re.subn(r'^  sha256 "[^"]*"$', f'  sha256 "{checksum}"', text, flags=re.M)
    if versions != 1 or sums != 1:
        raise SystemExit("The cask does not have exactly one version and sha256 line")
    cask.write_text(text, encoding="utf-8")
    print(f"{cask}: {version} {checksum}")


if __name__ == "__main__":
    main()
