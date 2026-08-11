import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

import telemetry_store  # noqa: E402


class TelemetryStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.database_path = str(Path(self.temporary_directory.name) / "telemetry.db")
        self.environment = patch.dict(os.environ, {"TELEMETRY_DB_PATH": self.database_path})
        self.environment.start()

    def tearDown(self) -> None:
        self.environment.stop()
        self.temporary_directory.cleanup()

    def test_records_history_evaluates_alerts_and_audits_acknowledgement(self) -> None:
        telemetry_store.record_stats(
            {
                "collected_at": "2026-08-11T10:00:00+00:00",
                "vps": {
                    "cpu": {"percent": 91},
                    "memory": {"percent": 42},
                    "disks": [{"percent": 55}],
                    "network": {"eth0": {"bytes_recv": 100, "bytes_sent": 200}},
                },
                "docker": {
                    "available": True,
                    "summary": {"containers_running": 1, "containers_total": 1},
                    "containers": [
                        {
                            "full_id": "a" * 64,
                            "name": "api",
                            "status": "running",
                            "health": "healthy",
                            "restart_count": 0,
                            "stats": {"cpu_percent": 2, "memory_percent": 3},
                        }
                    ],
                },
            }
        )

        history = telemetry_store.get_history(since=0)
        container_history = telemetry_store.get_container_history("a" * 64, since=0)
        alerts = telemetry_store.get_alerts(include_resolved=False)
        self.assertEqual(len(history["samples"]), 1)
        self.assertEqual(history["samples"][0]["network_rx_bytes"], 100)
        self.assertEqual(len(container_history["samples"]), 1)
        self.assertEqual(alerts["summary"]["active"], 1)
        self.assertEqual(alerts["alerts"][0]["alert_key"], "host:cpu")

        self.assertTrue(telemetry_store.acknowledge_alert("host:cpu", "ops@example.com"))
        telemetry_store.record_audit(
            actor="ops@example.com",
            action="alert.acknowledge",
            target_id="host:cpu",
            target_name=None,
            outcome="success",
        )
        acknowledged = telemetry_store.get_alerts(include_resolved=False)["alerts"][0]
        audit = telemetry_store.get_audit_events()
        self.assertEqual(acknowledged["acknowledged_by"], "ops@example.com")
        self.assertEqual(audit["events"][0]["action"], "alert.acknowledge")

    def test_manages_users_and_profiles(self) -> None:
        created = telemetry_store.create_user(
            email="operator@example.com",
            display_name="Operator One",
            title="SRE",
            timezone_name="Africa/Nairobi",
            role="operator",
            status="active",
            actor="admin@example.com",
        )
        self.assertIsNotNone(created)
        self.assertEqual(created["role"], "operator")
        self.assertIsNone(
            telemetry_store.create_user(
                email="operator@example.com",
                display_name="Duplicate",
                title="",
                timezone_name="UTC",
                role="viewer",
                status="active",
                actor="admin@example.com",
            )
        )

        updated = telemetry_store.update_user(
            "operator@example.com",
            changes={"role": "admin", "status": "suspended"},
            actor="admin@example.com",
        )
        self.assertEqual(updated["role"], "admin")
        self.assertEqual(updated["status"], "suspended")

        profile = telemetry_store.upsert_user_profile(
            "operator@example.com",
            display_name="Operator Updated",
            title="Platform Engineer",
            timezone_name="Africa/Nairobi",
            actor="operator@example.com",
        )
        self.assertEqual(profile["display_name"], "Operator Updated")
        self.assertEqual(profile["role"], "admin")
        directory = telemetry_store.get_users()
        self.assertEqual(directory["summary"], {"total": 1, "active": 0, "suspended": 1, "admins": 1})


if __name__ == "__main__":
    unittest.main()
