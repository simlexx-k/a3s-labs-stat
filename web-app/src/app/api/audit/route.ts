import { type NextRequest, NextResponse } from "next/server";
import { proxyTelemetryJson } from "@/lib/telemetry-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json({ error: "Invalid audit request" }, { status: 400 });
  }
  return proxyTelemetryJson(request, "audit", { searchParams: new URLSearchParams({ limit: String(limit) }) });
}
