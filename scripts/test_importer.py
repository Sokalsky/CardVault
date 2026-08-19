import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("import-photo-archive.py")
SPEC = importlib.util.spec_from_file_location("cardvault_photo_importer", MODULE_PATH)
assert SPEC and SPEC.loader
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class PhotoImporterTests(unittest.TestCase):
    def test_maps_three_level_card_copy_file_path(self):
        mapping = {"card_name/copy_1": 123}
        self.assertEqual(IMPORTER.locate_mapping(("Card_Name", "Copy_1", "front.jpg"), mapping), ("Card_Name/Copy_1", 123))

    def test_maps_archive_with_optional_prefix(self):
        mapping = {"card_name/copy_1": 123}
        self.assertEqual(IMPORTER.locate_mapping(("archive", "Card_Name", "Copy_1", "front.jpg"), mapping), ("Card_Name/Copy_1", 123))


if __name__ == "__main__":
    unittest.main()
