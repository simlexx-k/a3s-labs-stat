import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const requestTimeoutMs = 8_000;

function getTelemetryUrl() {
  const baseUrl = process.env.TELEMETRY_API_URL;
  if (!baseUrl) return null;
  try {
    return new URL("stats", `${baseUrl.replace(/\/+$/, "")}/`);
  } catch {
    return null;
  }
}

export async function GET() {
  const telemetryUrl = getTelemetryUrl();
  if (!telemetryUrl) {
    console.error("[telemetry-proxy] TELEMETRY_API_URL is missing or invalid");
    return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(telemetryUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[telemetry-proxy] Upstream returned ${response.status}`);
      return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 502 });
    }

    const stats: unknown = await response.json();
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "request timed out" : "request failed";
    console.error(`[telemetry-proxy] ${reason}`);
    return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
