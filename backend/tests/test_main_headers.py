import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


APP_PATH = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_PATH))


class Headers:
    def __init__(self, values):
        self.values = values


class Response:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class Robyn:
    def __init__(self, _filename):
        pass

    def set_response_header(self, *_args):
        pass

    def get(self, _path):
        return lambda function: function

    def options(self, _path):
        return lambda function: function


robyn_module = types.ModuleType("robyn")
robyn_module.Headers = Headers
robyn_module.Request = object
robyn_module.Response = Response
robyn_module.Robyn = Robyn

collector_module = types.ModuleType("collector")
collector_module.collect_all_stats = lambda: {}


class ContainerLogsError(Exception):
    kind = "unavailable"


container_logs_module = types.ModuleType("container_logs")
container_logs_module.MAX_LOG_LINES = 5_000
container_logs_module.ContainerLogsError = ContainerLogsError
container_logs_module.collect_container_logs = lambda *_args, **_kwargs: {}
container_logs_module.valid_container_id = lambda _container_id: False

with patch.dict(
    sys.modules,
    {
        "robyn": robyn_module,
        "collector": collector_module,
        "container_logs": container_logs_module,
    },
):
    main = importlib.import_module("main")


class ContainerLogRouteTests(unittest.TestCase):
    def test_error_responses_defer_to_global_headers(self) -> None:
        body, status = main.container_logs(
            {"container_id": "invalid"},
            {},
        )

        self.assertEqual(body, {"error": "Invalid container identifier"})
        self.assertEqual(status, 400)

    def test_list_query_values_are_normalized(self) -> None:
        with (
            patch.object(main, "valid_container_id", return_value=True),
            patch.object(main, "collect_container_logs", return_value={"entries": []}) as collect_logs,
        ):
            response = main.container_logs(
                {"container_id": "a" * 64},
                {"tail": ["500"], "since": ["1786393701"]},
            )

        self.assertEqual(response, {"entries": []})
        collect_logs.assert_called_once_with("a" * 64, tail=500, since=1786393701)


if __name__ == "__main__":
    unittest.main()
