import { type NextRequest, NextResponse } from "next/server";
import { proxyTelemetryJson } from "@/lib/telemetry-proxy";

export const dynamic = "force-dynamic";
const containerIdPattern = /^[a-fA-F0-9]{12,64}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = Math.floor(Date.now() / 1000);
  const since = Number(request.nextUrl.searchParams.get("since") ?? now - 3_600);
  const until = Number(request.nextUrl.searchParams.get("until") ?? now);
  if (!containerIdPattern.test(id) || !Number.isInteger(since) || since < 0 || !Number.isInteger(until) || until < since || until > now + 60) {
    return NextResponse.json({ error: "Invalid events request" }, { status: 400 });
  }
  return proxyTelemetryJson(request, `containers/${encodeURIComponent(id)}/events`, {
    searchParams: new URLSearchParams({ since: String(since), until: String(until) }),
  });
}
