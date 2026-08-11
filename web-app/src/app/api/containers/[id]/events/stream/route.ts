import { type NextRequest, NextResponse } from "next/server";
import { resolveAccessPrincipal } from "@/lib/access-role";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";
import { createTelemetryTarget } from "@/lib/telemetry-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const containerIdPattern = /^[a-fA-F0-9]{12,64}$/;
const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown, id?: string) {
  return `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateCloudflareAccess(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const principal = await resolveAccessPrincipal(auth, request.nextUrl.origin);
  if (principal.status === "suspended") return NextResponse.json({ error: "Account suspended" }, { status: 403 });

  const { id } = await params;
  if (!containerIdPattern.test(id)) return NextResponse.json({ error: "Invalid events request" }, { status: 400 });

  const target = createTelemetryTarget(`containers/${encodeURIComponent(id)}/events`, request.nextUrl.origin);
  if (!target.ok) return NextResponse.json({ error: "Container events unavailable" }, { status: 503 });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let since = Math.floor(Date.now() / 1000) - 300;
        const seen = new Set<string>();
        const expiresAt = Date.now() + 55_000;

        try {
          controller.enqueue(encoder.encode(sseEvent("ready", { connected: true })));
          while (!request.signal.aborted && Date.now() < expiresAt) {
            const until = Math.floor(Date.now() / 1000);
            const url = new URL(target.url);
            url.searchParams.set("since", String(since));
            url.searchParams.set("until", String(until));
            const response = await fetch(url, { cache: "no-store", headers: target.headers, signal: request.signal });
            if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
            const payload = await response.json() as { events?: Array<{ id: string; timestamp: number }> };
            for (const event of payload.events ?? []) {
              if (seen.has(event.id)) continue;
              seen.add(event.id);
              controller.enqueue(encoder.encode(sseEvent("container-event", event, event.id)));
            }
            if (seen.size > 500) seen.clear();
            since = until;
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
            await delay(3_000, request.signal);
          }
        } catch (error) {
          if (!request.signal.aborted) {
            const message = error instanceof Error ? error.message : "Events unavailable";
            controller.enqueue(encoder.encode(sseEvent("telemetry-error", { error: message })));
          }
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Content-Type": "text/event-stream",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
