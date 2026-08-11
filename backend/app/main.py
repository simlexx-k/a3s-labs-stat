import hmac
import os
import re
import time
from urllib.parse import unquote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from robyn import Headers, Request, Response, Robyn

from container_logs import MAX_LOG_LINES, ContainerLogsError, collect_container_logs, valid_container_id
from container_operations import (
    ContainerOperationError,
    collect_container_details,
    collect_container_events,
    perform_container_action,
)
from telemetry_store import (
    acknowledge_alert,
    create_user,
    get_alerts,
    get_audit_events,
    get_container_history,
    get_history,
    get_user,
    get_users,
    record_audit,
    update_user,
    upsert_user_profile,
)
from telemetry_sampler import collect_and_record, latest_stats, start_telemetry_sampler

app = Robyn(__file__)


cors_origin = os.getenv("CORS_ORIGIN", "*")
app.set_response_header("Access-Control-Allow-Origin", cors_origin)
app.set_response_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
app.set_response_header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Istatus-Write-Token, X-Istatus-Actor",
)
app.set_response_header("Cache-Control", "no-store")


def _cors_header_values() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": cors_origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Istatus-Write-Token, X-Istatus-Actor",
        "Cache-Control": "no-store",
    }


def _cors_headers() -> Headers:
    return Headers(_cors_header_values())


def _query_value(query_params, key: str, default=None):
    value = query_params.get(key, default)
    if isinstance(value, (list, tuple)):
        return value[0] if value else default
    return value


def _header_value(headers, key: str, default: str = "") -> str:
    value = headers.get(key, default)
    if not value:
        value = headers.get(key.lower(), default)
    if isinstance(value, (list, tuple)):
        value = value[0] if value else default
    return str(value or default)


def _write_authorized(headers) -> bool:
    configured_token = os.getenv("TELEMETRY_WRITE_TOKEN", "").strip()
    supplied_token = _header_value(headers, "x-istatus-write-token").strip()
    return bool(configured_token and supplied_token and hmac.compare_digest(configured_token, supplied_token))


def _operation_error(exc: ContainerOperationError):
    status = {"invalid": 400, "not_found": 404, "conflict": 409}.get(exc.kind, 503)
    return {"error": str(exc)}, {}, status


def _bounded_query_int(query_params, key: str, default: int, minimum: int, maximum: int) -> int:
    value = int(_query_value(query_params, key, str(default)))
    if value < minimum or value > maximum:
        raise ValueError
    return value


_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USER_ROLES = {"viewer", "operator", "admin"}
_USER_STATUSES = {"active", "suspended"}


def _normalized_email(value) -> str:
    email = unquote(str(value or "")).strip().lower()
    return email if len(email) <= 254 and _EMAIL_PATTERN.fullmatch(email) else ""


def _text_field(payload: dict, key: str, maximum: int, default: str = "") -> str:
    value = str(payload.get(key, default)).strip()
    if len(value) > maximum:
        raise ValueError
    return value


def _timezone_field(payload: dict, default: str = "UTC") -> str:
    timezone_name = _text_field(payload, "timezone", 64, default)
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError from exc
    return timezone_name


def _request_json(request: Request) -> dict:
    payload = request.json()
    if not isinstance(payload, dict):
        raise ValueError
    return payload


@app.options("/api/:path")
def options(request):
    return Response(status_code=204, headers=_cors_headers(), description="")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "a3s-labs-stat-backend"}


@app.get("/api/stats")
def stats():
    return latest_stats() or collect_and_record()


@app.get("/api/history")
def history(query_params):
    now = int(time.time())
    try:
        since = _bounded_query_int(query_params, "since", now - 86_400, 0, now + 60)
        limit = _bounded_query_int(query_params, "limit", 2_000, 1, 10_000)
    except (TypeError, ValueError):
        return {"error": "Invalid history query"}, {}, 400
    return get_history(since=since, limit=limit)


@app.get("/api/alerts")
def alerts(query_params):
    include_resolved = str(_query_value(query_params, "include_resolved", "true")).lower() != "false"
    try:
        limit = _bounded_query_int(query_params, "limit", 200, 1, 500)
    except (TypeError, ValueError):
        return {"error": "Invalid alerts query"}, {}, 400
    return get_alerts(include_resolved=include_resolved, limit=limit)


@app.get("/api/audit")
def audit(query_params):
    try:
        limit = _bounded_query_int(query_params, "limit", 100, 1, 500)
    except (TypeError, ValueError):
        return {"error": "Invalid audit query"}, {}, 400
    return get_audit_events(limit=limit)


@app.get("/api/users/resolve")
def resolve_user(query_params):
    email = _normalized_email(_query_value(query_params, "email"))
    if not email:
        return {"error": "Invalid user query"}, {}, 400
    return {"user": get_user(email)}


@app.get("/api/users")
def users(query_params):
    try:
        limit = _bounded_query_int(query_params, "limit", 500, 1, 500)
    except (TypeError, ValueError):
        return {"error": "Invalid user query"}, {}, 400
    return get_users(limit=limit)


@app.post("/api/users")
def add_user(request: Request, headers):
    if not _write_authorized(headers):
        return {"error": "Write access denied"}, {}, 403
    try:
        payload = _request_json(request)
        email = _normalized_email(payload.get("email"))
        if not email:
            raise ValueError
        display_name = _text_field(payload, "display_name", 80)
        title = _text_field(payload, "title", 100)
        timezone_name = _timezone_field(payload)
        role = str(payload.get("role", "viewer")).strip().lower()
        status = str(payload.get("status", "active")).strip().lower()
        if role not in _USER_ROLES or status not in _USER_STATUSES:
            raise ValueError
    except (TypeError, ValueError):
        return {"error": "Invalid user payload"}, {}, 400

    actor = _header_value(headers, "x-istatus-actor", "unknown")[:254]
    stored_user = create_user(
        email=email,
        display_name=display_name,
        title=title,
        timezone_name=timezone_name,
        role=role,
        status=status,
        actor=actor,
    )
    if stored_user is None:
        return {"error": "User already exists"}, {}, 409
    record_audit(
        actor=actor,
        action="user.create",
        target_id=email,
        target_name=display_name or email,
        outcome="success",
        detail={"role": role, "status": status},
    )
    return {"user": stored_user}, {}, 201


@app.get("/api/users/:email")
def user(path_params):
    email = _normalized_email(path_params["email"])
    if not email:
        return {"error": "Invalid user identifier"}, {}, 400
    stored_user = get_user(email)
    if stored_user is None:
        return {"error": "User not found"}, {}, 404
    return {"user": stored_user}


@app.post("/api/users/:email")
def change_user(request: Request, path_params, headers):
    if not _write_authorized(headers):
        return {"error": "Write access denied"}, {}, 403
    email = _normalized_email(path_params["email"])
    if not email:
        return {"error": "Invalid user identifier"}, {}, 400
    try:
        payload = _request_json(request)
        changes = {}
        if "display_name" in payload:
            changes["display_name"] = _text_field(payload, "display_name", 80)
        if "title" in payload:
            changes["title"] = _text_field(payload, "title", 100)
        if "timezone" in payload:
            changes["timezone"] = _timezone_field(payload)
        if "role" in payload:
            role = str(payload["role"]).strip().lower()
            if role not in _USER_ROLES:
                raise ValueError
            changes["role"] = role
        if "status" in payload:
            status = str(payload["status"]).strip().lower()
            if status not in _USER_STATUSES:
                raise ValueError
            changes["status"] = status
        if not changes:
            raise ValueError
    except (TypeError, ValueError):
        return {"error": "Invalid user payload"}, {}, 400

    actor = _header_value(headers, "x-istatus-actor", "unknown")[:254]
    stored_user = update_user(email, changes=changes, actor=actor)
    if stored_user is None:
        return {"error": "User not found"}, {}, 404
    record_audit(
        actor=actor,
        action="user.update",
        target_id=email,
        target_name=stored_user["display_name"] or email,
        outcome="success",
        detail={"fields": sorted(changes)},
    )
    return {"user": stored_user}


@app.post("/api/users/:email/profile")
def save_profile(request: Request, path_params, headers):
    if not _write_authorized(headers):
        return {"error": "Write access denied"}, {}, 403
    email = _normalized_email(path_params["email"])
    actor = _normalized_email(_header_value(headers, "x-istatus-actor"))
    if not email or actor != email:
        return {"error": "Profile access denied"}, {}, 403
    try:
        payload = _request_json(request)
        display_name = _text_field(payload, "display_name", 80)
        title = _text_field(payload, "title", 100)
        timezone_name = _timezone_field(payload)
    except (TypeError, ValueError):
        return {"error": "Invalid profile payload"}, {}, 400

    stored_user = upsert_user_profile(
        email,
        display_name=display_name,
        title=title,
        timezone_name=timezone_name,
        actor=actor,
    )
    record_audit(
        actor=actor,
        action="profile.update",
        target_id=email,
        target_name=display_name or email,
        outcome="success",
        detail={"fields": ["display_name", "title", "timezone"]},
    )
    return {"user": stored_user}


@app.post("/api/alerts/:alert_key/acknowledge")
def acknowledge(path_params, headers):
    if not _write_authorized(headers):
        return {"error": "Write access denied"}, {}, 403
    actor = _header_value(headers, "x-istatus-actor", "unknown")[:254]
    alert_key = unquote(path_params["alert_key"])
    acknowledged = acknowledge_alert(alert_key, actor)
    record_audit(
        actor=actor,
        action="alert.acknowledge",
        target_id=alert_key,
        target_name=None,
        outcome="success" if acknowledged else "not_found",
    )
    if not acknowledged:
        return {"error": "Active alert not found"}, {}, 404
    return {"alert_key": alert_key, "acknowledged": True, "acknowledged_by": actor}


@app.get("/api/containers/:container_id")
def container_details(path_params):
    try:
        return collect_container_details(path_params["container_id"])
    except ContainerOperationError as exc:
        return _operation_error(exc)


@app.get("/api/containers/:container_id/history")
def container_history(path_params, query_params):
    container_id = path_params["container_id"]
    if not valid_container_id(container_id):
        return {"error": "Invalid container identifier"}, {}, 400
    now = int(time.time())
    try:
        since = _bounded_query_int(query_params, "since", now - 86_400, 0, now + 60)
        limit = _bounded_query_int(query_params, "limit", 2_000, 1, 10_000)
    except (TypeError, ValueError):
        return {"error": "Invalid history query"}, {}, 400
    return get_container_history(container_id, since=since, limit=limit)


@app.get("/api/containers/:container_id/events")
def container_events(path_params, query_params):
    now = int(time.time())
    try:
        since = _bounded_query_int(query_params, "since", now - 3_600, 0, now + 60)
        until = _bounded_query_int(query_params, "until", now, since, now + 60)
    except (TypeError, ValueError):
        return {"error": "Invalid event query"}, {}, 400
    try:
        return collect_container_events(path_params["container_id"], since=since, until=until)
    except ContainerOperationError as exc:
        return _operation_error(exc)


@app.post("/api/containers/:container_id/actions/:action")
def container_action(path_params, headers):
    if not _write_authorized(headers):
        return {"error": "Write access denied"}, {}, 403

    container_id = path_params["container_id"]
    action = path_params["action"]
    actor = _header_value(headers, "x-istatus-actor", "unknown")[:254]
    try:
        result = perform_container_action(container_id, action)
    except ContainerOperationError as exc:
        record_audit(
            actor=actor,
            action=f"container.{action}",
            target_id=container_id,
            target_name=None,
            outcome="failed",
            detail={"error": str(exc), "kind": exc.kind},
        )
        return _operation_error(exc)

    record_audit(
        actor=actor,
        action=f"container.{action}",
        target_id=result["container_id"],
        target_name=result["name"],
        outcome="success",
        detail={"status": result["status"]},
    )
    return result


@app.get("/api/containers/:container_id/logs")
def container_logs(path_params, query_params):
    container_id = path_params["container_id"]
    if not valid_container_id(container_id):
        return {"error": "Invalid container identifier"}, {}, 400

    try:
        tail = int(_query_value(query_params, "tail", "500"))
        since_value = _query_value(query_params, "since")
        since = int(since_value) if since_value else None
    except (TypeError, ValueError):
        return {"error": "Invalid log query"}, {}, 400

    if tail < 1 or tail > MAX_LOG_LINES or (since is not None and since < 0):
        return {"error": "Invalid log query"}, {}, 400

    try:
        return collect_container_logs(container_id, tail=tail, since=since)
    except ContainerLogsError as exc:
        status = 404 if exc.kind == "not_found" else 503
        return {"error": str(exc)}, {}, status


if __name__ == "__main__":
    host = os.getenv("ROBYN_HOST", "0.0.0.0")
    port = int(os.getenv("ROBYN_PORT", "8080"))
    start_telemetry_sampler()
    app.start(host=host, port=port)
