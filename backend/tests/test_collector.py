import sys
import threading
import time
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))


try:
    import docker  # noqa: F401
except ModuleNotFoundError:
    docker_module = types.ModuleType("docker")
    docker_errors_module = types.ModuleType("docker.errors")

    class DockerException(Exception):
        pass

    docker_module.from_env = Mock()
    docker_errors_module.DockerException = DockerException
    sys.modules["docker"] = docker_module
    sys.modules["docker.errors"] = docker_errors_module

try:
    import psutil  # noqa: F401
except ModuleNotFoundError:
    sys.modules["psutil"] = types.ModuleType("psutil")

try:
    from requests.exceptions import RequestException  # noqa: F401
except ModuleNotFoundError:
    requests_module = types.ModuleType("requests")
    requests_exceptions_module = types.ModuleType("requests.exceptions")

    class RequestException(Exception):
        pass

    requests_exceptions_module.RequestException = RequestException
    sys.modules["requests"] = requests_module
    sys.modules["requests.exceptions"] = requests_exceptions_module

import collector  # noqa: E402


class FakeContainer:
    def __init__(self, name: str, status: str = "running") -> None:
        self.name = name
        self.status = status
        self.short_id = name[:12]
        self.id = f"{name}-full-id"
        self.stats_calls = 0
        self.reload_calls = 0
        self.attrs = {
            "State": {"Running": status == "running", "StartedAt": "", "FinishedAt": ""},
            "Config": {"Image": f"example/{name}:latest", "Labels": {}, "Cmd": [], "Entrypoint": []},
            "HostConfig": {"RestartPolicy": {}},
            "NetworkSettings": {"Ports": {}, "Networks": {}},
            "RestartCount": 0,
            "Created": "",
        }

    def reload(self) -> None:
        self.reload_calls += 1

    def stats(self, stream: bool = False) -> dict:
        del stream
        self.stats_calls += 1
        with activity_lock:
            activity["current"] += 1
            activity["maximum"] = max(activity["maximum"], activity["current"])
        time.sleep(0.05)
        with activity_lock:
            activity["current"] -= 1
        return {
            "cpu_stats": {},
            "precpu_stats": {},
            "memory_stats": {"usage": 1024, "limit": 4096},
            "networks": {},
            "blkio_stats": {},
            "pids_stats": {"current": 2},
        }


activity_lock = threading.Lock()
activity = {"current": 0, "maximum": 0}


class DockerCollectorTests(unittest.TestCase):
    def setUp(self) -> None:
        activity["current"] = 0
        activity["maximum"] = 0

    @patch("collector.docker.from_env")
    def test_collects_running_containers_concurrently(self, from_env: Mock) -> None:
        running = [FakeContainer(f"service-{index}") for index in range(4)]
        stopped = FakeContainer("completed-job", status="exited")
        client = from_env.return_value
        client.version.return_value = {}
        client.info.return_value = {}
        client.containers.list.return_value = [*running, stopped]

        result = collector.collect_docker_stats()

        from_env.assert_called_once_with(timeout=collector.DOCKER_REQUEST_TIMEOUT_SECONDS)
        client.containers.list.assert_called_once_with(all=True, sparse=True)
        self.assertGreater(activity["maximum"], 1)
        self.assertEqual(stopped.stats_calls, 0)
        self.assertEqual(stopped.reload_calls, 0)
        self.assertTrue(all(container.reload_calls == 1 for container in running))
        self.assertEqual(result["summary"]["containers_total"], 5)
        self.assertEqual(result["summary"]["containers_running"], 4)
        client.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
