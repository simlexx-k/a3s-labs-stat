import { type NextRequest, NextResponse } from "next/server";
import { proxyTelemetryJson } from "@/lib/telemetry-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const includeResolved = request.nextUrl.searchParams.get("include_resolved") ?? "true";
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 200);
  if (!["true", "false"].includes(includeResolved) || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json({ error: "Invalid alerts request" }, { status: 400 });
  }
  return proxyTelemetryJson(request, "alerts", {
    searchParams: new URLSearchParams({ include_resolved: includeResolved, limit: String(limit) }),
  });
}
