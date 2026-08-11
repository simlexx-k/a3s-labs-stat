from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any

import docker
from docker.errors import APIError, DockerException, NotFound
from requests.exceptions import RequestException

from container_logs import valid_container_id


DOCKER_REQUEST_TIMEOUT_SECONDS = 5
MAX_EVENTS = 200
ALLOWED_ACTIONS = {"start", "stop", "restart", "pause", "unpause"}
SENSITIVE_KEY = re.compile(
    r"(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|authorization|auth|cookie)",
    re.IGNORECASE,
)


class ContainerOperationError(Exception):
    def __init__(self, message: str, *, kind: str = "unavailable") -> None:
        super().__init__(message)
        self.kind = kind


def _container_name(attrs: dict[str, Any], fallback: str) -> str:
    return str(attrs.get("Name") or fallback).lstrip("/")


def _redact_mapping(values: dict[str, Any] | None) -> dict[str, Any]:
    return {
        str(key): "[redacted]" if SENSITIVE_KEY.search(str(key)) else value
        for key, value in (values or {}).items()
    }


def _environment(values: list[str] | None) -> list[dict[str, str]]:
    environment = []
    for item in values or []:
        key, separator, value = item.partition("=")
        environment.append(
            {
                "key": key,
                "value": "[redacted]" if SENSITIVE_KEY.search(key) else value if separator else "",
            }
        )
    return environment


def _health(attrs: dict[str, Any]) -> dict[str, Any] | None:
    health = attrs.get("State", {}).get("Health")
    if not isinstance(health, dict):
        return None

    recent = []
    for entry in (health.get("Log") or [])[-5:]:
        output = entry.get("Output", "")
        if isinstance(output, bytes):
            output = output.decode("utf-8", errors="replace")
        recent.append(
            {
                "started_at": entry.get("Start"),
                "finished_at": entry.get("End"),
                "exit_code": entry.get("ExitCode"),
                "output": str(output).strip()[:2_000],
            }
        )
    return {
        "status": health.get("Status"),
        "failing_streak": health.get("FailingStreak", 0),
        "recent_checks": recent,
    }


def _ports(network_settings: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for container_port, bindings in (network_settings.get("Ports") or {}).items():
        if not bindings:
            result.append({"container_port": container_port, "host_ip": None, "host_port": None})
            continue
        for binding in bindings:
            result.append(
                {
                    "container_port": container_port,
                    "host_ip": binding.get("HostIp"),
                    "host_port": binding.get("HostPort"),
                }
            )
    return result


def _networks(network_settings: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "name": name,
            "network_id": values.get("NetworkID"),
            "endpoint_id": values.get("EndpointID"),
            "ip_address": values.get("IPAddress"),
            "gateway": values.get("Gateway"),
            "mac_address": values.get("MacAddress"),
            "aliases": values.get("Aliases") or [],
        }
        for name, values in (network_settings.get("Networks") or {}).items()
    ]


def collect_container_details(container_id: str) -> dict[str, Any]:
    if not valid_container_id(container_id):
        raise ContainerOperationError("Invalid container identifier", kind="invalid")

    client = None
    try:
        client = docker.from_env(timeout=DOCKER_REQUEST_TIMEOUT_SECONDS)
        container = client.containers.get(container_id)
        container.reload()
        attrs = container.attrs
        state = attrs.get("State") if isinstance(attrs.get("State"), dict) else {}
        config = attrs.get("Config") if isinstance(attrs.get("Config"), dict) else {}
        host = attrs.get("HostConfig") if isinstance(attrs.get("HostConfig"), dict) else {}
        network = attrs.get("NetworkSettings") if isinstance(attrs.get("NetworkSettings"), dict) else {}

        return {
            "collected_at": datetime.now(tz=timezone.utc).isoformat(),
            "container": {
                "id": container.short_id,
                "full_id": container.id,
                "name": _container_name(attrs, container.name),
                "image": config.get("Image") or attrs.get("Image") or "unknown",
                "status": state.get("Status") or container.status,
                "created": attrs.get("Created"),
                "started_at": state.get("StartedAt"),
                "finished_at": state.get("FinishedAt"),
                "exit_code": state.get("ExitCode"),
                "error": state.get("Error"),
                "restart_count": attrs.get("RestartCount", 0),
                "platform": attrs.get("Platform"),
                "driver": attrs.get("Driver"),
                "command": config.get("Cmd") or [],
                "entrypoint": config.get("Entrypoint") or [],
                "working_dir": config.get("WorkingDir"),
                "user": config.get("User"),
                "hostname": config.get("Hostname"),
                "restart_policy": host.get("RestartPolicy") or {},
                "resources": {
                    "cpu_shares": host.get("CpuShares"),
                    "cpu_quota": host.get("CpuQuota"),
                    "cpu_period": host.get("CpuPeriod"),
                    "nano_cpus": host.get("NanoCpus"),
                    "cpuset_cpus": host.get("CpusetCpus"),
                    "memory": host.get("Memory"),
                    "memory_swap": host.get("MemorySwap"),
                    "pids_limit": host.get("PidsLimit"),
                },
                "health": _health(attrs),
                "ports": _ports(network),
                "networks": _networks(network),
                "mounts": [
                    {
                        "type": mount.get("Type"),
                        "name": mount.get("Name"),
                        "source": mount.get("Source"),
                        "destination": mount.get("Destination"),
                        "driver": mount.get("Driver"),
                        "mode": mount.get("Mode"),
                        "rw": mount.get("RW"),
                        "propagation": mount.get("Propagation"),
                    }
                    for mount in attrs.get("Mounts") or []
                ],
                "labels": _redact_mapping(config.get("Labels")),
                "environment": _environment(config.get("Env")),
            },
        }
    except NotFound as exc:
        raise ContainerOperationError("Container not found", kind="not_found") from exc
    except (DockerException, RequestException) as exc:
        raise ContainerOperationError("Docker engine unavailable") from exc
    finally:
        if client is not None:
            client.close()


def collect_container_events(container_id: str, *, since: int, until: int) -> dict[str, Any]:
    if not valid_container_id(container_id):
        raise ContainerOperationError("Invalid container identifier", kind="invalid")
    if since < 0 or until < since or until > int(time.time()) + 60:
        raise ContainerOperationError("Invalid event query", kind="invalid")

    client = None
    try:
        client = docker.from_env(timeout=DOCKER_REQUEST_TIMEOUT_SECONDS)
        container = client.containers.get(container_id)
        events = []
        for event in client.events(
            decode=True,
            since=since,
            until=until,
            filters={"type": "container", "container": container.id},
        ):
            actor = event.get("Actor") or {}
            attributes = actor.get("Attributes") or {}
            events.append(
                {
                    "id": f"{event.get('timeNano') or event.get('time', 0)}:{event.get('Action') or event.get('status', '')}",
                    "timestamp": int(event.get("time", 0)),
                    "time_nano": event.get("timeNano"),
                    "action": event.get("Action") or event.get("status") or "unknown",
                    "container_id": actor.get("ID") or event.get("id") or container.id,
                    "container_name": attributes.get("name") or container.name,
                    "image": attributes.get("image"),
                    "attributes": _redact_mapping(attributes),
                }
            )
            if len(events) >= MAX_EVENTS:
                break
        return {"container_id": container.id, "since": since, "until": until, "events": events}
    except NotFound as exc:
        raise ContainerOperationError("Container not found", kind="not_found") from exc
    except (DockerException, RequestException) as exc:
        raise ContainerOperationError("Docker events unavailable") from exc
    finally:
        if client is not None:
            client.close()


def perform_container_action(container_id: str, action: str) -> dict[str, Any]:
    if not valid_container_id(container_id):
        raise ContainerOperationError("Invalid container identifier", kind="invalid")
    if action not in ALLOWED_ACTIONS:
        raise ContainerOperationError("Unsupported container action", kind="invalid")

    client = None
    try:
        client = docker.from_env(timeout=DOCKER_REQUEST_TIMEOUT_SECONDS)
        container = client.containers.get(container_id)
        getattr(container, action)(timeout=10) if action in {"stop", "restart"} else getattr(container, action)()
        container.reload()
        return {
            "container_id": container.id,
            "name": container.name,
            "action": action,
            "status": container.status,
            "completed_at": datetime.now(tz=timezone.utc).isoformat(),
        }
    except NotFound as exc:
        raise ContainerOperationError("Container not found", kind="not_found") from exc
    except APIError as exc:
        raise ContainerOperationError("Container action rejected", kind="conflict") from exc
    except (DockerException, RequestException) as exc:
        raise ContainerOperationError("Docker engine unavailable") from exc
    finally:
        if client is not None:
            client.close()
