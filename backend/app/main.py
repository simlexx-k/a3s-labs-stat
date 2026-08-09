import os

from robyn import Headers, Request, Response, Robyn

from collector import collect_all_stats

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


if __name__ == "__main__":
    host = os.getenv("ROBYN_HOST", "0.0.0.0")
    port = int(os.getenv("ROBYN_PORT", "8080"))
    app.start(host=host, port=port)

