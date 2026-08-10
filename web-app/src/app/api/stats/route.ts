import { type NextRequest, NextResponse } from "next/server";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";
import { createTelemetryTarget } from "@/lib/telemetry-server";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const requestTimeoutMs = 30_000;

export async function GET(request: NextRequest) {
  const auth = await authenticateCloudflareAccess(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const target = createTelemetryTarget("stats", request.nextUrl.origin);
  if (!target.ok) {
    console.error(`[telemetry-proxy] Invalid telemetry configuration: ${target.reason}`);
    return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(target.url, {
      cache: "no-store",
      headers: target.headers,
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
