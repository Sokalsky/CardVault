import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

from PIL import Image

from app import ProcessRequest, exposure_score, overall_score


class WorkerScoringTests(unittest.TestCase):
    def test_balanced_exposure_scores_above_clipped_white(self):
        with tempfile.TemporaryDirectory() as folder:
            balanced = Path(folder) / "balanced.jpg"
            clipped = Path(folder) / "clipped.jpg"
            Image.new("L", (100, 100), 128).save(balanced)
            Image.new("L", (100, 100), 255).save(clipped)
            self.assertGreater(exposure_score(balanced), exposure_score(clipped))

    def test_overall_score_rewards_sharpness_and_exposure(self):
        self.assertGreater(overall_score(500, 0.8), overall_score(20, 0.8))
        self.assertGreater(overall_score(500, 0.8), overall_score(500, 0.1))

    def test_request_aliases_and_limits(self):
        identifier = str(uuid4())
        request = ProcessRequest.model_validate({
            "jobId": identifier,
            "mediaAssetId": identifier,
            "physicalCardId": identifier,
            "storagePath": f"cards/{identifier}/videos/test.mp4",
            "captureType": "front_surface",
            "fps": 4,
            "maxFrames": 12,
        })
        self.assertEqual(request.max_frames, 12)


if __name__ == "__main__":
    unittest.main()
