import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

import container_logs  # noqa: E402


class ContainerLogCollectorTests(unittest.TestCase):
    @patch("container_logs.docker.from_env")
    def test_collects_and_merges_bounded_streams(self, from_env: Mock) -> None:
        client = from_env.return_value
        container = client.containers.get.return_value
        container.short_id = "a" * 12
        container.id = "a" * 64
        container.name = "worker"
        container.attrs = {
            "Name": "/worker",
            "State": {"Status": "running"},
            "Config": {"Image": "example/worker:latest"},
        }
        container.logs.side_effect = [
            b"2026-08-10T10:00:01.000000000Z started\n2026-08-10T10:00:03.000000000Z ready\n",
            b"2026-08-10T10:00:02.000000000Z warning: retrying\n",
        ]

        result = container_logs.collect_container_logs("a" * 64, tail=3, since=100)

        self.assertEqual([entry["stream"] for entry in result["entries"]], ["stdout", "stderr", "stdout"])
        self.assertEqual(result["entries"][1]["message"], "warning: retrying")
        self.assertEqual(result["summary"]["lines"], 3)
        self.assertEqual(result["summary"]["stderr_lines"], 1)
        self.assertEqual(result["query"], {"tail": 3, "since": 100})
        self.assertEqual(container.logs.call_count, 2)
        client.close.assert_called_once_with()

    @patch("container_logs.docker.from_env")
    def test_limits_merged_result_to_requested_tail(self, from_env: Mock) -> None:
        client = from_env.return_value
        container = client.containers.get.return_value
        container.short_id = "b" * 12
        container.id = "b" * 64
        container.name = "api"
        container.attrs = {"State": {"Status": "running"}, "Config": {"Image": "api:latest"}}
        container.logs.side_effect = [
            b"2026-08-10T10:00:01Z one\n2026-08-10T10:00:03Z three\n",
            b"2026-08-10T10:00:02Z two\n2026-08-10T10:00:04Z four\n",
        ]

        result = container_logs.collect_container_logs("b" * 64, tail=2)

        self.assertEqual([entry["message"] for entry in result["entries"]], ["three", "four"])
        self.assertTrue(result["summary"]["truncated"])

    def test_validates_container_ids(self) -> None:
        self.assertTrue(container_logs.valid_container_id("a" * 12))
        self.assertTrue(container_logs.valid_container_id("B" * 64))
        self.assertFalse(container_logs.valid_container_id("api-gateway"))
        self.assertFalse(container_logs.valid_container_id("a" * 11))


if __name__ == "__main__":
    unittest.main()
