from __future__ import annotations

import logging
import os
from threading import Event, Lock, Thread
from typing import Any

from collector import collect_all_stats
from telemetry_store import record_stats


logger = logging.getLogger(__name__)
_LATEST_LOCK = Lock()
_LATEST: dict[str, Any] | None = None
_STARTED = False


def _interval_seconds() -> int:
    try:
        value = int(os.getenv("TELEMETRY_SAMPLE_INTERVAL_SECONDS", "15"))
    except ValueError:
        value = 15
    return max(5, min(value, 300))


def collect_and_record() -> dict[str, Any]:
    global _LATEST
    result = collect_all_stats()
    record_stats(result)
    with _LATEST_LOCK:
        _LATEST = result
    return result


def latest_stats() -> dict[str, Any] | None:
    with _LATEST_LOCK:
        return _LATEST


def _sample_forever() -> None:
    stopped = Event()
    while True:
        try:
            collect_and_record()
        except Exception:
            logger.exception("Unable to collect telemetry sample")
        stopped.wait(_interval_seconds())


def start_telemetry_sampler() -> None:
    global _STARTED
    with _LATEST_LOCK:
        if _STARTED:
            return
        _STARTED = True
    Thread(target=_sample_forever, name="telemetry-sampler", daemon=True).start()
