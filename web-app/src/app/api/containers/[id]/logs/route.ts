import { type NextRequest, NextResponse } from "next/server";
import { proxyTelemetryJson } from "@/lib/telemetry-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const containerIdPattern = /^[a-fA-F0-9]{12,64}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const searchParams = new URLSearchParams({ tail: String(tailValue) });
  if (sinceValue !== null) searchParams.set("since", String(sinceValue));
  return proxyTelemetryJson(request, `containers/${encodeURIComponent(id)}/logs`, { searchParams });
}
