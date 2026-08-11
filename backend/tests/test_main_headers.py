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

    def post(self, _path):
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


class ContainerOperationError(Exception):
    kind = "unavailable"


container_operations_module = types.ModuleType("container_operations")
container_operations_module.ContainerOperationError = ContainerOperationError
container_operations_module.collect_container_details = lambda *_args, **_kwargs: {}
container_operations_module.collect_container_events = lambda *_args, **_kwargs: {}
container_operations_module.perform_container_action = lambda *_args, **_kwargs: {}

telemetry_store_module = types.ModuleType("telemetry_store")
telemetry_store_module.acknowledge_alert = lambda *_args, **_kwargs: False
telemetry_store_module.get_alerts = lambda *_args, **_kwargs: {"alerts": []}
telemetry_store_module.get_audit_events = lambda *_args, **_kwargs: {"events": []}
telemetry_store_module.get_container_history = lambda *_args, **_kwargs: {"samples": []}
telemetry_store_module.get_history = lambda *_args, **_kwargs: {"samples": []}
telemetry_store_module.record_audit = lambda *_args, **_kwargs: None
telemetry_store_module.record_stats = lambda *_args, **_kwargs: None

telemetry_sampler_module = types.ModuleType("telemetry_sampler")
telemetry_sampler_module.collect_and_record = lambda: {}
telemetry_sampler_module.latest_stats = lambda: {}
telemetry_sampler_module.start_telemetry_sampler = lambda: None

with patch.dict(
    sys.modules,
    {
        "robyn": robyn_module,
        "collector": collector_module,
        "container_logs": container_logs_module,
        "container_operations": container_operations_module,
        "telemetry_store": telemetry_store_module,
        "telemetry_sampler": telemetry_sampler_module,
    },
):
    main = importlib.import_module("main")


class ContainerLogRouteTests(unittest.TestCase):
    def test_error_responses_use_empty_route_headers(self) -> None:
        body, headers, status = main.container_logs(
            {"container_id": "invalid"},
            {},
        )

        self.assertEqual(body, {"error": "Invalid container identifier"})
        self.assertEqual(headers, {})
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

    def test_write_route_requires_private_token(self) -> None:
        with patch.dict(main.os.environ, {"TELEMETRY_WRITE_TOKEN": "expected"}):
            body, headers, status = main.container_action(
                {"container_id": "a" * 64, "action": "restart"},
                {"x-istatus-write-token": ["incorrect"]},
            )

        self.assertEqual(body, {"error": "Write access denied"})
        self.assertEqual(headers, {})
        self.assertEqual(status, 403)

    def test_write_route_dispatches_and_records_actor(self) -> None:
        result = {
            "container_id": "a" * 64,
            "name": "api",
            "action": "restart",
            "status": "running",
        }
        with (
            patch.dict(main.os.environ, {"TELEMETRY_WRITE_TOKEN": "expected"}),
            patch.object(main, "perform_container_action", return_value=result) as perform,
            patch.object(main, "record_audit") as record,
        ):
            response = main.container_action(
                {"container_id": "a" * 64, "action": "restart"},
                {"x-istatus-write-token": ["expected"], "x-istatus-actor": ["ops@example.com"]},
            )

        self.assertEqual(response, result)
        perform.assert_called_once_with("a" * 64, "restart")
        self.assertEqual(record.call_args.kwargs["actor"], "ops@example.com")


if __name__ == "__main__":
    unittest.main()
