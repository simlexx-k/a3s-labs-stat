import { type NextRequest, NextResponse } from "next/server";
import { proxyTelemetryJson } from "@/lib/telemetry-proxy";

export const dynamic = "force-dynamic";
const containerIdPattern = /^[a-fA-F0-9]{12,64}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const since = Number(request.nextUrl.searchParams.get("since") ?? Math.floor(Date.now() / 1000) - 86_400);
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 2_000);
  if (!containerIdPattern.test(id) || !Number.isInteger(since) || since < 0 || !Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    return NextResponse.json({ error: "Invalid history request" }, { status: 400 });
  }
  return proxyTelemetryJson(request, `containers/${encodeURIComponent(id)}/history`, {
    searchParams: new URLSearchParams({ since: String(since), limit: String(limit) }),
  });
}
