import tempfile
from pathlib import Path
import unittest

from classify_mtdna import classification, position_count, stage_profile


class MaternalProfileTests(unittest.TestCase):
    def test_overlapping_ranges_are_counted_once(self):
        self.assertEqual(position_count(" 3-7;1-5;8;16569; "), 9)
        for invalid in ["", "0-7", "16570", "3-2", "1:12"]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                position_count(invalid)

    def test_staging_replaces_identifiers_and_expected_haplogroup(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "profile.hsd"
            target = Path(folder) / "input.hsd"
            source.write_text("Sample under test\t1-1000\tH100\t73G 263G\n", encoding="utf-8")
            stage_profile(source, target)
            self.assertEqual(target.read_text(encoding="utf-8"), "RootsLocal\t1-1000\t?\t73G\t263G\n")
            source.write_text("One\t1-9\t?\t2G\nTwo\t1-9\t?\t2G\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                stage_profile(source, target)

    def test_summary_preserves_rank_and_counts_without_mutation_or_ids(self):
        with tempfile.TemporaryDirectory() as folder:
            result = Path(folder) / "result.txt"
            result.write_text(
                "SampleID\tHaplogroup\tRank\tQuality\tRange\n"
                "RootsLocal\tH100\t1\t0.8351\t1-900\nRootsLocal\tH\t2\t0.8054\t1-900\n",
                encoding="utf-8",
            )
            result.with_suffix(".qc.txt").write_text(
                "SampleID\tType\tMessage\nRootsLocal\twarning\tSample mutation text\n",
                encoding="utf-8",
            )
            summary = classification(result)
            self.assertEqual(summary["warnings"], 1)
            self.assertEqual(summary["errors"], 0)
            self.assertEqual(summary["covered_positions"], 900)
            self.assertEqual([row["haplogroup"] for row in summary["candidates"]], ["H100", "H"])
            self.assertNotIn("Sample mutation text", str(summary))
            self.assertNotIn("RootsLocal", str(summary))
