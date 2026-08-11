import "server-only";

import { createTelemetryTarget } from "@/lib/telemetry-server";

type InternalRequestOptions = {
  actor?: string;
  body?: unknown;
  method?: "GET" | "POST";
  searchParams?: URLSearchParams;
};

export type InternalTelemetryResult =
  | { ok: true; payload: unknown; status: number }
  | { ok: false; reason: "configuration" | "network" | "response" };

export async function requestTelemetryInternal(
  pathname: string,
  requestOrigin: string,
  options: InternalRequestOptions = {},
): Promise<InternalTelemetryResult> {
  const target = createTelemetryTarget(pathname, requestOrigin);
  if (!target.ok) return { ok: false, reason: "configuration" };
  options.searchParams?.forEach((value, key) => target.url.searchParams.set(key, value));

  const method = options.method ?? "GET";
  const headers = { ...target.headers };
  if (method !== "GET") {
    const writeToken = process.env.TELEMETRY_WRITE_TOKEN?.trim();
    if (!writeToken || !options.actor) return { ok: false, reason: "configuration" };
    headers["Content-Type"] = "application/json";
    headers["X-Istatus-Write-Token"] = writeToken;
    headers["X-Istatus-Actor"] = options.actor;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(target.url, {
      body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
      cache: "no-store",
      headers,
      method,
      signal: controller.signal,
    });
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return { ok: false, reason: "response" };
    }
    return { ok: true, payload: await response.json() as unknown, status: response.status };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timeout);
  }
}
