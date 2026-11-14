"""Check the synthetic full report with pypdf."""
from pathlib import Path
import re
import sys
from pypdf import PdfReader

pdf = PdfReader(sys.argv[1])
spec = (Path(__file__).resolve().parents[1] / "docs" / "report-structure.md").read_text(encoding="utf-8")
chapters = re.findall(r"^### (\d{2}) · ", spec, re.M)
sections = re.findall(r"^- \*\*(\d{2}\.\d+) ", spec, re.M)
bookmarks = [entry.title for entry in pdf.outline if isinstance(entry, dict)]
assert [match[1] for title in bookmarks if (match := re.match(r"^(\d{2}) · ", title))] == chapters
text = "\n".join(page.extract_text() for page in pdf.pages)
assert all(f"{section} ·" in text for section in sections)
language = sys.argv[2] if len(sys.argv) > 2 else "en"
expected = {
    "en": ["Explore your DNA. Offline.", "Synthetic profile", "Lactase activity in adulthood", "Variant index"],
    "de": ["Entdecke deine DNA. Offline.", "Synthetisches Profil", "Laktaseaktivität im Erwachsenenalter", "Variantenregister"],
}[language]
assert all(value in text for value in expected), expected
links = 0
for page in pdf.pages:
    for annotation in page.get("/Annots", []):
        link = annotation.get_object()
        if link.get("/Subtype") != "/Link":
            continue
        links += 1
        action = link.get("/A")
        if action and action.get("/S") == "/URI":
            assert action["/URI"].startswith("https://")
        else:
            destination = link.get("/Dest") or (action and action.get("/D"))
            if isinstance(destination, str):
                assert destination in pdf.named_destinations
assert links >= len(chapters) + len(sections)
print(f"{len(pdf.pages)} pages, {len(chapters)} chapters, {len(sections)} sections, {links} links")
