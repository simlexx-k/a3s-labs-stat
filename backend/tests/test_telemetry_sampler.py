import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

import telemetry_sampler  # noqa: E402


class TelemetrySamplerTests(unittest.TestCase):
    def tearDown(self) -> None:
        telemetry_sampler._LATEST = None

    def test_collection_updates_cache_after_persistence(self) -> None:
        sample = {"collected_at": "2026-08-11T10:00:00+00:00"}
        with (
            patch.object(telemetry_sampler, "collect_all_stats", return_value=sample),
            patch.object(telemetry_sampler, "record_stats") as record,
        ):
            result = telemetry_sampler.collect_and_record()

        self.assertIs(result, sample)
        self.assertIs(telemetry_sampler.latest_stats(), sample)
        record.assert_called_once_with(sample)


if __name__ == "__main__":
    unittest.main()
