from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Literal

import docker
from docker.errors import APIError, DockerException, NotFound
from requests.exceptions import RequestException


DOCKER_REQUEST_TIMEOUT_SECONDS = 5
MAX_LOG_LINES = 5_000
MAX_LOG_MESSAGE_CHARS = 32_768

_CONTAINER_ID = re.compile(r"^[a-fA-F0-9]{12,64}$")
_DOCKER_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")


class ContainerLogsError(Exception):
    def __init__(self, kind: Literal["not_found", "unavailable"], message: str) -> None:
        super().__init__(message)
        self.kind = kind


def valid_container_id(container_id: str) -> bool:
    return bool(_CONTAINER_ID.fullmatch(container_id))


def _parse_lines(payload: bytes, stream: Literal["stdout", "stderr"]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for position, raw_line in enumerate(payload.decode("utf-8", errors="replace").splitlines()):
        possible_timestamp, separator, remainder = raw_line.partition(" ")
        has_timestamp = bool(separator and _DOCKER_TIMESTAMP.fullmatch(possible_timestamp))
        message = remainder if has_timestamp else raw_line
        truncated = len(message) > MAX_LOG_MESSAGE_CHARS
        entries.append(
            {
                "timestamp": possible_timestamp if has_timestamp else None,
                "stream": stream,
                "message": message[:MAX_LOG_MESSAGE_CHARS],
                "truncated": truncated,
                "_position": position,
            }
        )
    return entries


def _container_status(attrs: dict[str, Any]) -> str:
    state = attrs.get("State", {})
    if isinstance(state, dict):
        return state.get("Status") or ("running" if state.get("Running") else "unknown")
    return str(state or "unknown")


def collect_container_logs(container_id: str, *, tail: int, since: int | None = None) -> dict[str, Any]:
    client = None
    try:
        client = docker.from_env(timeout=DOCKER_REQUEST_TIMEOUT_SECONDS)
        client.ping()
        container = client.containers.get(container_id)
        container.reload()

        log_options: dict[str, Any] = {
            "stream": False,
            "timestamps": True,
            "tail": tail,
        }
        if since is not None:
            log_options["since"] = since

        stdout_payload = container.logs(stdout=True, stderr=False, **log_options)
        stderr_payload = container.logs(stdout=False, stderr=True, **log_options)
        stdout_entries = _parse_lines(stdout_payload, "stdout")
        stderr_entries = _parse_lines(stderr_payload, "stderr")

        entries = [*stdout_entries, *stderr_entries]
        entries.sort(
            key=lambda entry: (
                entry["timestamp"] is None,
                entry["timestamp"] or "",
                0 if entry["stream"] == "stdout" else 1,
                entry["_position"],
            )
        )
        truncated = len(entries) > tail
        entries = entries[-tail:]
        for entry in entries:
            entry.pop("_position", None)

        attrs = container.attrs
        config = attrs.get("Config", {})
        name = (attrs.get("Name") or getattr(container, "name", container.short_id)).lstrip("/")

        return {
            "collected_at": datetime.now(tz=timezone.utc).isoformat(),
            "container": {
                "id": container.short_id,
                "full_id": container.id,
                "name": name,
                "image": config.get("Image") or attrs.get("Image") or "unknown",
                "status": _container_status(attrs),
            },
            "query": {"tail": tail, "since": since},
            "entries": entries,
            "summary": {
                "lines": len(entries),
                "stdout_lines": sum(entry["stream"] == "stdout" for entry in entries),
                "stderr_lines": sum(entry["stream"] == "stderr" for entry in entries),
                "bytes": len(stdout_payload) + len(stderr_payload),
                "truncated": truncated,
            },
        }
    except NotFound as exc:
        raise ContainerLogsError("not_found", "Container not found") from exc
    except (APIError, DockerException, RequestException) as exc:
        raise ContainerLogsError("unavailable", "Container logs are unavailable") from exc
    finally:
        if client is not None:
            client.close()
