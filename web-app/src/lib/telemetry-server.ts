import "server-only";

export type TelemetryTarget =
  | { ok: true; url: URL; headers: Record<string, string> }
  | { ok: false; reason: "invalid_url" | "same_origin" | "incomplete_service_token" };

export function createTelemetryTarget(pathname: string, requestOrigin: string): TelemetryTarget {
  const baseUrl = process.env.TELEMETRY_API_URL;
  if (!baseUrl) return { ok: false, reason: "invalid_url" };

  let url: URL;
  try {
    url = new URL(pathname.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.origin === requestOrigin) return { ok: false, reason: "same_origin" };

  const clientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    return { ok: false, reason: "incomplete_service_token" };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (clientId && clientSecret) {
    headers["CF-Access-Client-Id"] = clientId;
    headers["CF-Access-Client-Secret"] = clientSecret;
  }

  return { ok: true, url, headers };
}
