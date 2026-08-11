from __future__ import annotations

import json
import os
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


DEFAULT_RETENTION_DAYS = 30
DEFAULT_HISTORY_LIMIT = 2_000
MAX_HISTORY_LIMIT = 10_000

_DB_LOCK = Lock()


def _database_path() -> Path:
    return Path(os.getenv("TELEMETRY_DB_PATH", "/data/telemetry.db"))


def _retention_seconds() -> int:
    try:
        days = int(os.getenv("TELEMETRY_RETENTION_DAYS", str(DEFAULT_RETENTION_DAYS)))
    except ValueError:
        days = DEFAULT_RETENTION_DAYS
    return max(1, min(days, 365)) * 86_400


def _threshold(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _connect() -> sqlite3.Connection:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=5000")
    _ensure_schema(connection)
    return connection


def _ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS metric_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            collected_at TEXT NOT NULL,
            cpu_percent REAL NOT NULL,
            memory_percent REAL NOT NULL,
            disk_percent REAL NOT NULL,
            network_rx_bytes INTEGER NOT NULL,
            network_tx_bytes INTEGER NOT NULL,
            containers_running INTEGER NOT NULL,
            containers_total INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_metric_samples_timestamp
            ON metric_samples(timestamp);

        CREATE TABLE IF NOT EXISTS container_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            container_id TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            health TEXT,
            cpu_percent REAL NOT NULL,
            memory_percent REAL NOT NULL,
            restart_count INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_container_samples_lookup
            ON container_samples(container_id, timestamp);

        CREATE TABLE IF NOT EXISTS alert_states (
            alert_key TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            value REAL,
            threshold REAL,
            unit TEXT,
            target_id TEXT,
            target_name TEXT,
            opened_at INTEGER,
            updated_at INTEGER NOT NULL,
            resolved_at INTEGER,
            acknowledged_at INTEGER,
            acknowledged_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_alert_states_status
            ON alert_states(status, updated_at DESC);

        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            target_id TEXT,
            target_name TEXT,
            outcome TEXT NOT NULL,
            detail TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp
            ON audit_events(timestamp DESC);
        """
    )


def _timestamp(value: str | None) -> int:
    if value:
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())
        except (TypeError, ValueError):
            pass
    return int(time.time())


def _network_totals(network: dict[str, Any]) -> tuple[int, int]:
    return (
        sum(int(item.get("bytes_recv", 0)) for item in network.values()),
        sum(int(item.get("bytes_sent", 0)) for item in network.values()),
    )


def _update_alert(
    connection: sqlite3.Connection,
    *,
    alert_key: str,
    title: str,
    category: str,
    severity: str,
    active: bool,
    value: float | None,
    threshold: float | None,
    unit: str | None,
    target_id: str | None = None,
    target_name: str | None = None,
    now: int,
) -> None:
    existing = connection.execute(
        "SELECT status, opened_at FROM alert_states WHERE alert_key = ?",
        (alert_key,),
    ).fetchone()

    if active:
        opened_at = existing["opened_at"] if existing and existing["status"] == "active" else now
        connection.execute(
            """
            INSERT INTO alert_states (
                alert_key, title, category, severity, status, value, threshold, unit,
                target_id, target_name, opened_at, updated_at, resolved_at,
                acknowledged_at, acknowledged_by
            ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
            ON CONFLICT(alert_key) DO UPDATE SET
                title = excluded.title,
                category = excluded.category,
                severity = excluded.severity,
                status = 'active',
                value = excluded.value,
                threshold = excluded.threshold,
                unit = excluded.unit,
                target_id = excluded.target_id,
                target_name = excluded.target_name,
                opened_at = excluded.opened_at,
                updated_at = excluded.updated_at,
                resolved_at = NULL,
                acknowledged_at = CASE
                    WHEN alert_states.status = 'active' THEN alert_states.acknowledged_at
                    ELSE NULL
                END,
                acknowledged_by = CASE
                    WHEN alert_states.status = 'active' THEN alert_states.acknowledged_by
                    ELSE NULL
                END
            """,
            (
                alert_key,
                title,
                category,
                severity,
                value,
                threshold,
                unit,
                target_id,
                target_name,
                opened_at,
                now,
            ),
        )
    elif existing and existing["status"] == "active":
        connection.execute(
            """
            UPDATE alert_states
            SET status = 'resolved', value = ?, updated_at = ?, resolved_at = ?
            WHERE alert_key = ?
            """,
            (value, now, now, alert_key),
        )


def _evaluate_alerts(connection: sqlite3.Connection, stats: dict[str, Any], now: int) -> None:
    vps = stats.get("vps", {})
    docker = stats.get("docker", {})
    cpu = float(vps.get("cpu", {}).get("percent", 0))
    memory = float(vps.get("memory", {}).get("percent", 0))
    disk = max((float(item.get("percent", 0)) for item in vps.get("disks", [])), default=0)
    cpu_threshold = _threshold("ALERT_CPU_PERCENT", 85)
    memory_threshold = _threshold("ALERT_MEMORY_PERCENT", 85)
    disk_threshold = _threshold("ALERT_DISK_PERCENT", 90)
    restart_threshold = _threshold("ALERT_RESTART_COUNT", 3)

    _update_alert(
        connection,
        alert_key="host:cpu",
        title="High CPU utilization",
        category="resource",
        severity="critical" if cpu >= 95 else "warning",
        active=cpu >= cpu_threshold,
        value=cpu,
        threshold=cpu_threshold,
        unit="%",
        now=now,
    )
    _update_alert(
        connection,
        alert_key="host:memory",
        title="High memory utilization",
        category="resource",
        severity="critical" if memory >= 95 else "warning",
        active=memory >= memory_threshold,
        value=memory,
        threshold=memory_threshold,
        unit="%",
        now=now,
    )
    _update_alert(
        connection,
        alert_key="host:disk",
        title="Disk capacity pressure",
        category="capacity",
        severity="critical" if disk >= 97 else "warning",
        active=disk >= disk_threshold,
        value=disk,
        threshold=disk_threshold,
        unit="%",
        now=now,
    )
    _update_alert(
        connection,
        alert_key="docker:availability",
        title="Docker engine unavailable",
        category="availability",
        severity="critical",
        active=not bool(docker.get("available")),
        value=0 if docker.get("available") else 1,
        threshold=0,
        unit=None,
        now=now,
    )

    evaluated_container_keys: set[str] = set()
    for container in docker.get("containers", []):
        container_id = str(container.get("full_id") or container.get("id") or "")
        name = str(container.get("name") or container_id[:12])
        restart_count = float(container.get("restart_count", 0))
        health = container.get("health")

        restart_key = f"container:{container_id}:restarts"
        health_key = f"container:{container_id}:health"
        evaluated_container_keys.update((restart_key, health_key))
        _update_alert(
            connection,
            alert_key=restart_key,
            title=f"{name} restart count is elevated",
            category="container",
            severity="warning",
            active=restart_count >= restart_threshold,
            value=restart_count,
            threshold=restart_threshold,
            unit="restarts",
            target_id=container_id,
            target_name=name,
            now=now,
        )
        _update_alert(
            connection,
            alert_key=health_key,
            title=f"{name} is unhealthy",
            category="container",
            severity="critical",
            active=health == "unhealthy",
            value=1 if health == "unhealthy" else 0,
            threshold=0,
            unit=None,
            target_id=container_id,
            target_name=name,
            now=now,
        )

    active_container_alerts = connection.execute(
        "SELECT alert_key FROM alert_states WHERE status = 'active' AND alert_key LIKE 'container:%'"
    ).fetchall()
    for row in active_container_alerts:
        if row["alert_key"] not in evaluated_container_keys:
            _update_alert(
                connection,
                alert_key=row["alert_key"],
                title="Container alert",
                category="container",
                severity="warning",
                active=False,
                value=None,
                threshold=None,
                unit=None,
                now=now,
            )


def record_stats(stats: dict[str, Any]) -> None:
    now = _timestamp(stats.get("collected_at"))
    vps = stats.get("vps", {})
    docker = stats.get("docker", {})
    network_rx, network_tx = _network_totals(vps.get("network", {}))
    disk_percent = max((float(item.get("percent", 0)) for item in vps.get("disks", [])), default=0)

    with _DB_LOCK, closing(_connect()) as connection:
        connection.execute(
            """
            INSERT INTO metric_samples (
                timestamp, collected_at, cpu_percent, memory_percent, disk_percent,
                network_rx_bytes, network_tx_bytes, containers_running, containers_total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now,
                stats.get("collected_at") or datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
                float(vps.get("cpu", {}).get("percent", 0)),
                float(vps.get("memory", {}).get("percent", 0)),
                disk_percent,
                network_rx,
                network_tx,
                int(docker.get("summary", {}).get("containers_running", 0)),
                int(docker.get("summary", {}).get("containers_total", 0)),
            ),
        )
        for container in docker.get("containers", []):
            connection.execute(
                """
                INSERT INTO container_samples (
                    timestamp, container_id, name, status, health, cpu_percent,
                    memory_percent, restart_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now,
                    container.get("full_id") or container.get("id"),
                    container.get("name") or "unknown",
                    container.get("status") or "unknown",
                    container.get("health"),
                    float(container.get("stats", {}).get("cpu_percent", 0)),
                    float(container.get("stats", {}).get("memory_percent", 0)),
                    int(container.get("restart_count", 0)),
                ),
            )

        _evaluate_alerts(connection, stats, now)
        cutoff = now - _retention_seconds()
        connection.execute("DELETE FROM metric_samples WHERE timestamp < ?", (cutoff,))
        connection.execute("DELETE FROM container_samples WHERE timestamp < ?", (cutoff,))
        connection.commit()


def get_history(*, since: int, limit: int = DEFAULT_HISTORY_LIMIT) -> dict[str, Any]:
    bounded_limit = max(1, min(limit, MAX_HISTORY_LIMIT))
    with _DB_LOCK, closing(_connect()) as connection:
        rows = connection.execute(
            """
            SELECT timestamp, collected_at, cpu_percent, memory_percent, disk_percent,
                   network_rx_bytes, network_tx_bytes, containers_running, containers_total
            FROM metric_samples
            WHERE timestamp >= ?
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (since, bounded_limit),
        ).fetchall()
    return {"since": since, "samples": [dict(row) for row in rows]}


def get_container_history(container_id: str, *, since: int, limit: int = DEFAULT_HISTORY_LIMIT) -> dict[str, Any]:
    bounded_limit = max(1, min(limit, MAX_HISTORY_LIMIT))
    with _DB_LOCK, closing(_connect()) as connection:
        rows = connection.execute(
            """
            SELECT timestamp, name, status, health, cpu_percent, memory_percent, restart_count
            FROM container_samples
            WHERE container_id = ? AND timestamp >= ?
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (container_id, since, bounded_limit),
        ).fetchall()
    return {"container_id": container_id, "since": since, "samples": [dict(row) for row in rows]}


def get_alerts(*, include_resolved: bool = True, limit: int = 200) -> dict[str, Any]:
    where = "" if include_resolved else "WHERE status = 'active'"
    with _DB_LOCK, closing(_connect()) as connection:
        rows = connection.execute(
            f"""
            SELECT alert_key, title, category, severity, status, value, threshold, unit,
                   target_id, target_name, opened_at, updated_at, resolved_at,
                   acknowledged_at, acknowledged_by
            FROM alert_states
            {where}
            ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC
            LIMIT ?
            """,
            (max(1, min(limit, 500)),),
        ).fetchall()
    alerts = [dict(row) for row in rows]
    return {
        "summary": {
            "active": sum(item["status"] == "active" for item in alerts),
            "critical": sum(item["status"] == "active" and item["severity"] == "critical" for item in alerts),
            "acknowledged": sum(
                item["status"] == "active" and item["acknowledged_at"] is not None
                for item in alerts
            ),
        },
        "alerts": alerts,
    }


def acknowledge_alert(alert_key: str, actor: str) -> bool:
    now = int(time.time())
    with _DB_LOCK, closing(_connect()) as connection:
        cursor = connection.execute(
            """
            UPDATE alert_states
            SET acknowledged_at = ?, acknowledged_by = ?, updated_at = ?
            WHERE alert_key = ? AND status = 'active'
            """,
            (now, actor, now, alert_key),
        )
        connection.commit()
        return cursor.rowcount > 0


def record_audit(
    *,
    actor: str,
    action: str,
    target_id: str | None,
    target_name: str | None,
    outcome: str,
    detail: dict[str, Any] | str | None = None,
) -> None:
    encoded_detail = json.dumps(detail, separators=(",", ":")) if isinstance(detail, dict) else detail
    with _DB_LOCK, closing(_connect()) as connection:
        connection.execute(
            """
            INSERT INTO audit_events (timestamp, actor, action, target_id, target_name, outcome, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (int(time.time()), actor, action, target_id, target_name, outcome, encoded_detail),
        )
        connection.commit()


def get_audit_events(*, limit: int = 100) -> dict[str, Any]:
    with _DB_LOCK, closing(_connect()) as connection:
        rows = connection.execute(
            """
            SELECT id, timestamp, actor, action, target_id, target_name, outcome, detail
            FROM audit_events
            ORDER BY timestamp DESC, id DESC
            LIMIT ?
            """,
            (max(1, min(limit, 500)),),
        ).fetchall()
    return {"events": [dict(row) for row in rows]}
