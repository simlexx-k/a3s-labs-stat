import { type NextRequest, NextResponse } from "next/server";
import { proxyTelemetryJson } from "@/lib/telemetry-proxy";

export const dynamic = "force-dynamic";

const containerIdPattern = /^[a-fA-F0-9]{12,64}$/;
const actions = new Set(["start", "stop", "restart", "pause", "unpause"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!containerIdPattern.test(id)) return NextResponse.json({ error: "Invalid container request" }, { status: 400 });
  return proxyTelemetryJson(request, `containers/${encodeURIComponent(id)}`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!containerIdPattern.test(id)) return NextResponse.json({ error: "Invalid container request" }, { status: 400 });
  let action: string;
  try {
    action = String((await request.json() as { action?: unknown }).action ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid container action" }, { status: 400 });
  }
  if (!actions.has(action)) return NextResponse.json({ error: "Invalid container action" }, { status: 400 });
  return proxyTelemetryJson(request, `containers/${encodeURIComponent(id)}/actions/${action}`, {
    method: "POST",
    minimumRole: "operator",
  });
}
