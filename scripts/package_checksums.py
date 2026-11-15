"""Create checksums for packaged installer artifacts."""
from hashlib import file_digest
from pathlib import Path
import sys

bundle, output = map(Path, sys.argv[1:])
packages = sorted(bundle.glob("dmg/*.dmg"))
if not packages:
    raise SystemExit("No packaged installers found")
checksums = []
for package in packages:
    with package.open("rb") as content:
        checksums.append(f"{file_digest(content, 'sha256').hexdigest()}  {package.name}")
output.write_text("\n".join(checksums) + "\n", encoding="utf-8")
