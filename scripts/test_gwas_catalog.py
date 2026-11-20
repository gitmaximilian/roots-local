import csv
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from gwas_catalog import COLUMNS, add_associations, liftover


class GwasImportTest(unittest.TestCase):
    def test_selects_significant_single_loci_and_deduplicates_by_paper(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            table = root / "test.tsv"
            fields = sorted(COLUMNS | {"OR or BETA", "MERGED", "CNV", "SNP_ID_CURRENT"})
            base = {
                "PUBMEDID": "123456", "STUDY ACCESSION": "GCST000123",
                "MAPPED_TRAIT_URI": "http://www.ebi.ac.uk/efo/EFO_0001645",
                "DISEASE/TRAIT": "Synthetic coronary phenotype",
                "CHR_ID": "1", "CHR_POS": "101", "SNPS": "rs90000001",
                "INITIAL SAMPLE SIZE": "100 synthetic individuals",
                "OR or BETA": "1.2",
            }
            with table.open("w", encoding="utf-8", newline="") as buffer:
                writer = csv.DictWriter(buffer, fields, delimiter="\t")
                writer.writeheader()
                for changes in [
                    {"P-VALUE": "2e-9"},
                    {"P-VALUE": "5e-20"},
                    {"P-VALUE": "0.08", "PUBMEDID": "333"},
                    {"P-VALUE": "1e-15", "PUBMEDID": "444", "SNPS": "rs90000001, rs90000002"},
                    {"P-VALUE": "1e-15", "PUBMEDID": "555", "SNP_ID_CURRENT": "90000002"},
                ]:
                    writer.writerow(base | changes)
            packed = root / "test.zip"
            with ZipFile(packed, "w") as z:
                z.write(table, table.name)
            data = {"markers": [], "traits": []}
            self.assertEqual(add_associations(data, packed, 100), 1)
            self.assertEqual(data["markers"], [["rs90000001", "GWAS-Lokus", "1", 0, 101, "ACGT"]])
            result = data["traits"][0]
            self.assertEqual((result["section"], result["method"]), ("09.1", "gwas"))
            self.assertEqual(result["study"]["p_value"], "5E-20")

    def test_liftover_rejects_gaps_and_competing_reverse_blocks(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "test.chain"
            path.write_text(
                "chain 90 chr1 1000 + 100 115 chr1 1000 + 200 225 1\n"
                "5 5 10\n5\n\n"
                "chain 70 chr1 1000 + 104 105 chr1 1000 - 500 501 2\n1\n",
                encoding="utf-8",
            )
            mapping = liftover(path)
            self.assertEqual(mapping("1", 101), 201)
            self.assertEqual(mapping("1", 105), 0)
            self.assertEqual(mapping("1", 109), 0)
            self.assertEqual(mapping("1", 111), 216)
            self.assertEqual(mapping("2", 101), 0)


if __name__ == "__main__":
    unittest.main()
