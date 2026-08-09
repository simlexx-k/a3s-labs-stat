from __future__ import annotations

import os
import platform
import socket
import time
from datetime import datetime, timezone
from typing import Any

import docker
import psutil
from docker.errors import DockerException


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def _safe_percent(value: float | int, total: float | int) -> float:
    if not total:
        return 0.0
    return round((float(value) / float(total)) * 100, 2)


def _disk_usage() -> list[dict[str, Any]]:
    partitions = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except (PermissionError, FileNotFoundError, OSError):
            continue

        partitions.append(
            {
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
            }
        )
    return partitions


def _network_io() -> dict[str, Any]:
    counters = psutil.net_io_counters(pernic=True)
    return {
        name: {
            "bytes_sent": value.bytes_sent,
            "bytes_recv": value.bytes_recv,
            "packets_sent": value.packets_sent,
            "packets_recv": value.packets_recv,
            "errors_in": value.errin,
            "errors_out": value.errout,
            "drops_in": value.dropin,
            "drops_out": value.dropout,
        }
        for name, value in counters.items()
    }


def collect_vps_stats() -> dict[str, Any]:
    boot_time = psutil.boot_time()
    virtual_memory = psutil.virtual_memory()
    swap = psutil.swap_memory()
    load_avg = os.getloadavg() if hasattr(os, "getloadavg") else (0.0, 0.0, 0.0)

    return {
        "hostname": socket.gethostname(),
        "fqdn": socket.getfqdn(),
        "platform": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "kernel": platform.version(),
        "architecture": platform.machine(),
        "processor": platform.processor(),
        "boot_time": _iso(boot_time),
        "uptime_seconds": int(time.time() - boot_time),
        "cpu": {
            "physical_cores": psutil.cpu_count(logical=False),
            "logical_cores": psutil.cpu_count(logical=True),
            "percent": psutil.cpu_percent(interval=0.15),
            "per_cpu_percent": psutil.cpu_percent(interval=None, percpu=True),
            "load_average": {
                "1m": load_avg[0],
                "5m": load_avg[1],
                "15m": load_avg[2],
            },
        },
        "memory": {
            "total": virtual_memory.total,
            "available": virtual_memory.available,
            "used": virtual_memory.used,
            "free": virtual_memory.free,
            "percent": virtual_memory.percent,
        },
        "swap": {
            "total": swap.total,
            "used": swap.used,
            "free": swap.free,
            "percent": swap.percent,
        },
        "disks": _disk_usage(),
        "network": _network_io(),
    }


def _container_cpu_percent(stats: dict[str, Any]) -> float:
    cpu_stats = stats.get("cpu_stats", {})
    precpu_stats = stats.get("precpu_stats", {})
    cpu_delta = (
        cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        - precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
    )
    system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)
    online_cpus = cpu_stats.get("online_cpus") or len(cpu_stats.get("cpu_usage", {}).get("percpu_usage") or []) or 1

    if cpu_delta > 0 and system_delta > 0:
        return round((cpu_delta / system_delta) * online_cpus * 100.0, 2)
    return 0.0


def _container_network(stats: dict[str, Any]) -> dict[str, int]:
    networks = stats.get("networks") or {}
    return {
        "rx_bytes": sum(value.get("rx_bytes", 0) for value in networks.values()),
        "tx_bytes": sum(value.get("tx_bytes", 0) for value in networks.values()),
        "rx_packets": sum(value.get("rx_packets", 0) for value in networks.values()),
        "tx_packets": sum(value.get("tx_packets", 0) for value in networks.values()),
    }


def _container_block_io(stats: dict[str, Any]) -> dict[str, int]:
    entries = stats.get("blkio_stats", {}).get("io_service_bytes_recursive") or []
    read_bytes = sum(item.get("value", 0) for item in entries if item.get("op") == "Read")
    write_bytes = sum(item.get("value", 0) for item in entries if item.get("op") == "Write")
    return {"read_bytes": read_bytes, "write_bytes": write_bytes}


def _format_container(container: Any) -> dict[str, Any]:
    attrs = container.attrs
    state = attrs.get("State", {})
    config = attrs.get("Config", {})
    host_config = attrs.get("HostConfig", {})
    network_settings = attrs.get("NetworkSettings", {})

    try:
        stats = container.stats(stream=False)
    except DockerException:
        stats = {}

    memory_stats = stats.get("memory_stats", {})
    memory_usage = memory_stats.get("usage", 0)
    memory_limit = memory_stats.get("limit", 0)

    image_name = config.get("Image") or attrs.get("Image") or "unknown"

    return {
        "id": container.short_id,
        "full_id": container.id,
        "name": container.name,
        "image": image_name,
        "image_tags": [image_name] if image_name != "unknown" else [],
        "status": container.status,
        "created": attrs.get("Created"),
        "started_at": state.get("StartedAt"),
        "finished_at": state.get("FinishedAt"),
        "restart_count": attrs.get("RestartCount", 0),
        "ports": attrs.get("NetworkSettings", {}).get("Ports") or {},
        "labels": config.get("Labels") or {},
        "command": config.get("Cmd") or [],
        "entrypoint": config.get("Entrypoint") or [],
        "restart_policy": host_config.get("RestartPolicy") or {},
        "networks": list((network_settings.get("Networks") or {}).keys()),
        "stats": {
            "cpu_percent": _container_cpu_percent(stats),
            "memory_usage": memory_usage,
            "memory_limit": memory_limit,
            "memory_percent": _safe_percent(memory_usage, memory_limit),
            "network": _container_network(stats),
            "block_io": _container_block_io(stats),
            "pids": stats.get("pids_stats", {}).get("current", 0),
        },
    }


def collect_docker_stats() -> dict[str, Any]:
    try:
        client = docker.from_env()
        client.ping()
        version = client.version()
        info = client.info()
        containers = client.containers.list(all=True)
    except DockerException as exc:
        return {
            "available": False,
            "error": str(exc),
            "version": None,
            "info": {},
            "containers": [],
            "summary": {
                "containers_total": 0,
                "containers_running": 0,
                "containers_stopped": 0,
                "images": 0,
            },
        }

    formatted = [_format_container(container) for container in containers]
    running = [container for container in formatted if container["status"] == "running"]

    return {
        "available": True,
        "error": None,
        "version": {
            "version": version.get("Version"),
            "api_version": version.get("ApiVersion"),
            "go_version": version.get("GoVersion"),
            "git_commit": version.get("GitCommit"),
            "os": version.get("Os"),
            "arch": version.get("Arch"),
        },
        "info": {
            "name": info.get("Name"),
            "server_version": info.get("ServerVersion"),
            "operating_system": info.get("OperatingSystem"),
            "kernel_version": info.get("KernelVersion"),
            "cpus": info.get("NCPU"),
            "memory_total": info.get("MemTotal"),
            "docker_root_dir": info.get("DockerRootDir"),
            "storage_driver": info.get("Driver"),
            "cgroup_driver": info.get("CgroupDriver"),
            "cgroup_version": info.get("CgroupVersion"),
            "swarm": info.get("Swarm", {}).get("LocalNodeState"),
        },
        "containers": formatted,
        "summary": {
            "containers_total": len(formatted),
            "containers_running": len(running),
            "containers_stopped": len(formatted) - len(running),
            "images": info.get("Images", 0),
        },
    }


def collect_all_stats() -> dict[str, Any]:
    return {
        "collected_at": datetime.now(tz=timezone.utc).isoformat(),
        "vps": collect_vps_stats(),
        "docker": collect_docker_stats(),
    }

