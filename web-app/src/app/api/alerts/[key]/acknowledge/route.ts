import { type NextRequest } from "next/server";
import { proxyTelemetryJson } from "@/lib/telemetry-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return proxyTelemetryJson(request, `alerts/${encodeURIComponent(key)}/acknowledge`, {
    method: "POST",
    minimumRole: "operator",
  });
}
