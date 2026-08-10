import { type NextRequest, NextResponse } from "next/server";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";
import { createTelemetryTarget } from "@/lib/telemetry-server";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const requestTimeoutMs = 30_000;
const containerIdPattern = /^[a-fA-F0-9]{12,64}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateCloudflareAccess(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const tail = request.nextUrl.searchParams.get("tail") ?? "500";
  const since = request.nextUrl.searchParams.get("since");
  const tailValue = Number(tail);
  const sinceValue = since === null ? null : Number(since);

  if (
    !containerIdPattern.test(id)
    || !Number.isInteger(tailValue)
    || tailValue < 1
    || tailValue > 5_000
    || (sinceValue !== null && (!Number.isInteger(sinceValue) || sinceValue < 0))
  ) {
    return NextResponse.json({ error: "Invalid log request" }, { status: 400 });
  }

  const target = createTelemetryTarget(`containers/${encodeURIComponent(id)}/logs`, request.nextUrl.origin);
  if (!target.ok) {
    console.error(`[container-logs-proxy] Invalid telemetry configuration: ${target.reason}`);
    return NextResponse.json({ error: "Container logs unavailable" }, { status: 503 });
  }

  target.url.searchParams.set("tail", String(tailValue));
  if (sinceValue !== null) target.url.searchParams.set("since", String(sinceValue));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(target.url, {
      cache: "no-store",
      headers: target.headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Container not found" }, { status: 404 });
      }
      if (response.status === 400) {
        return NextResponse.json({ error: "Invalid log request" }, { status: 400 });
      }
      console.error(`[container-logs-proxy] Upstream returned ${response.status}`);
      return NextResponse.json({ error: "Container logs unavailable" }, { status: 502 });
    }

    const payload: unknown = await response.json();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "request timed out" : "request failed";
    console.error(`[container-logs-proxy] ${reason}`);
    return NextResponse.json({ error: "Container logs unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
