import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { resolveAccessPrincipal, roleAllows, type AccessRole } from "@/lib/access-role";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";
import { createTelemetryTarget } from "@/lib/telemetry-server";

const requestTimeoutMs = 30_000;

type ProxyOptions = {
  method?: "GET" | "POST";
  minimumRole?: AccessRole;
  searchParams?: URLSearchParams;
};

export async function proxyTelemetryJson(request: NextRequest, pathname: string, options: ProxyOptions = {}) {
  const auth = await authenticateCloudflareAccess(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const method = options.method ?? "GET";
  const principal = await resolveAccessPrincipal(auth, request.nextUrl.origin);
  if (principal.status === "suspended") {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }
  if (options.minimumRole && !roleAllows(principal.role, options.minimumRole)) {
    return NextResponse.json({ error: "Operator access required" }, { status: 403 });
  }

  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Request origin denied" }, { status: 403 });
    }
  }

  const target = createTelemetryTarget(pathname, request.nextUrl.origin);
  if (!target.ok) {
    console.error(`[telemetry-proxy] Invalid telemetry configuration: ${target.reason}`);
    return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 503 });
  }
  options.searchParams?.forEach((value, key) => target.url.searchParams.set(key, value));

  const headers = { ...target.headers };
  if (method !== "GET") {
    const writeToken = process.env.TELEMETRY_WRITE_TOKEN?.trim();
    if (!writeToken) {
      console.error("[telemetry-proxy] TELEMETRY_WRITE_TOKEN is not configured");
      return NextResponse.json({ error: "Write service unavailable" }, { status: 503 });
    }
    headers["X-Istatus-Write-Token"] = writeToken;
    headers["X-Istatus-Actor"] = auth.identity.email;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(target.url, {
      cache: "no-store",
      headers,
      method,
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      console.error(`[telemetry-proxy] Upstream returned non-JSON response (${response.status})`);
      return NextResponse.json({ error: "Telemetry service unavailable" }, { status: 502 });
    }
    const payload: unknown = await response.json();
    return NextResponse.json(payload, {
      status: response.status,
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
