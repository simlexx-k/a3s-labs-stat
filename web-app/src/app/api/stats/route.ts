import { type NextRequest, NextResponse } from "next/server";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const requestTimeoutMs = 30_000;

function getTelemetryUrl() {
  const baseUrl = process.env.TELEMETRY_API_URL;
  if (!baseUrl) return null;
  try {
    return new URL("stats", `${baseUrl.replace(/\/+$/, "")}/`);
  } catch {
    return null;
  }
}

function getUpstreamHeaders() {
  const clientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();

  if (Boolean(clientId) !== Boolean(clientSecret)) return null;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (clientId && clientSecret) {
    headers["CF-Access-Client-Id"] = clientId;
    headers["CF-Access-Client-Secret"] = clientSecret;
  }
  return headers;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateCloudflareAccess(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const telemetryUrl = getTelemetryUrl();
  if (!telemetryUrl) {
    console.error("[telemetry-proxy] TELEMETRY_API_URL is missing or invalid");
    return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 503 });
  }

  if (telemetryUrl.origin === request.nextUrl.origin) {
    console.error("[telemetry-proxy] TELEMETRY_API_URL points to the web app origin");
    return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 503 });
  }

  const upstreamHeaders = getUpstreamHeaders();
  if (!upstreamHeaders) {
    console.error("[telemetry-proxy] Cloudflare service token is incomplete");
    return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(telemetryUrl, {
      cache: "no-store",
      headers: upstreamHeaders,
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
