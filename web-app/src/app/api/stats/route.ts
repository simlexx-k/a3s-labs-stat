import { type NextRequest } from "next/server";
import { proxyTelemetryJson } from "@/lib/telemetry-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(request: NextRequest) {
  return proxyTelemetryJson(request, "stats");
}
