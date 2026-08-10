import os

from robyn import Headers, Request, Response, Robyn

from collector import collect_all_stats
from container_logs import MAX_LOG_LINES, ContainerLogsError, collect_container_logs, valid_container_id

app = Robyn(__file__)


cors_origin = os.getenv("CORS_ORIGIN", "*")
app.set_response_header("Access-Control-Allow-Origin", cors_origin)
app.set_response_header("Access-Control-Allow-Methods", "GET, OPTIONS")
app.set_response_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
app.set_response_header("Cache-Control", "no-store")


def _cors_headers() -> Headers:
    return Headers(
        {
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Cache-Control": "no-store",
        }
    )


@app.options("/api/:path")
def options(request):
    return Response(status_code=204, headers=_cors_headers(), description="")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "a3s-labs-stat-backend"}


@app.get("/api/stats")
def stats():
    return collect_all_stats()


@app.get("/api/containers/:container_id/logs")
def container_logs(path_params, query_params):
    container_id = path_params["container_id"]
    if not valid_container_id(container_id):
        return {"error": "Invalid container identifier"}, _cors_headers(), 400

    try:
        tail = int(query_params.get("tail", "500"))
        since_value = query_params.get("since")
        since = int(since_value) if since_value else None
    except (TypeError, ValueError):
        return {"error": "Invalid log query"}, _cors_headers(), 400

    if tail < 1 or tail > MAX_LOG_LINES or (since is not None and since < 0):
        return {"error": "Invalid log query"}, _cors_headers(), 400

    try:
        return collect_container_logs(container_id, tail=tail, since=since)
    except ContainerLogsError as exc:
        status = 404 if exc.kind == "not_found" else 503
        return {"error": str(exc)}, _cors_headers(), status


if __name__ == "__main__":
    host = os.getenv("ROBYN_HOST", "0.0.0.0")
    port = int(os.getenv("ROBYN_PORT", "8080"))
    app.start(host=host, port=port)
