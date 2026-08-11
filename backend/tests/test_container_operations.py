import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

import container_operations  # noqa: E402


class ContainerOperationTests(unittest.TestCase):
    @patch("container_operations.docker.from_env")
    def test_details_redact_sensitive_configuration(self, from_env: Mock) -> None:
        client = from_env.return_value
        container = client.containers.get.return_value
        container.short_id = "a" * 12
        container.id = "a" * 64
        container.name = "api"
        container.status = "running"
        container.attrs = {
            "Name": "/api",
            "State": {"Status": "running", "Health": {"Status": "healthy", "Log": []}},
            "Config": {
                "Image": "example/api:latest",
                "Env": ["PORT=8080", "API_TOKEN=top-secret"],
                "Labels": {"owner": "platform", "auth.secret": "private"},
            },
            "HostConfig": {"RestartPolicy": {"Name": "always"}},
            "NetworkSettings": {"Ports": {}, "Networks": {}},
            "Mounts": [],
        }

        result = container_operations.collect_container_details("a" * 64)

        details = result["container"]
        self.assertEqual(details["environment"][0], {"key": "PORT", "value": "8080"})
        self.assertEqual(details["environment"][1], {"key": "API_TOKEN", "value": "[redacted]"})
        self.assertEqual(details["labels"]["auth.secret"], "[redacted]")
        self.assertEqual(details["health"]["status"], "healthy")
        client.close.assert_called_once_with()

    @patch("container_operations.docker.from_env")
    def test_restart_action_is_bounded_and_returns_new_status(self, from_env: Mock) -> None:
        client = from_env.return_value
        container = client.containers.get.return_value
        container.id = "b" * 64
        container.name = "worker"
        container.status = "running"

        result = container_operations.perform_container_action("b" * 64, "restart")

        container.restart.assert_called_once_with(timeout=10)
        container.reload.assert_called_once_with()
        self.assertEqual(result["status"], "running")
        client.close.assert_called_once_with()

    def test_rejects_unknown_actions_before_connecting(self) -> None:
        with self.assertRaises(container_operations.ContainerOperationError) as context:
            container_operations.perform_container_action("c" * 64, "remove")
        self.assertEqual(context.exception.kind, "invalid")


if __name__ == "__main__":
    unittest.main()
