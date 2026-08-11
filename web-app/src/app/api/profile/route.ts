import { type NextRequest, NextResponse } from "next/server";
import { accessContext, requestOriginAllowed } from "@/lib/access-server";
import { clearAccessPrincipalCache } from "@/lib/access-role";
import { requestTelemetryInternal } from "@/lib/telemetry-internal";
import { directoryUser, managedUserFromPayload, validText, validTimezone } from "@/lib/user-directory-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = await accessContext(request);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  return NextResponse.json({
    profile: directoryUser(
      context.principal.managedUser,
      context.auth.identity.email,
      context.auth.identity.email,
      context.principal,
    ),
    session: {
      expires_at: context.auth.identity.expiresAt,
      identity_provider: "Cloudflare Access",
      issued_at: context.auth.identity.issuedAt,
      subject: context.auth.identity.subject,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) return NextResponse.json({ error: "Request origin denied" }, { status: 403 });
  const context = await accessContext(request);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  let payload: { display_name: string; timezone: string; title: string };
  try {
    const body = await request.json() as Record<string, unknown>;
    const displayName = validText(body.display_name, 80);
    const title = validText(body.title, 100);
    const timezone = validTimezone(body.timezone);
    if (displayName === null || title === null || !timezone) throw new Error();
    payload = { display_name: displayName, title, timezone };
  } catch {
    return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  }

  const result = await requestTelemetryInternal(
    `users/${encodeURIComponent(context.auth.identity.email)}/profile`,
    request.nextUrl.origin,
    { actor: context.auth.identity.email, body: payload, method: "POST" },
  );
  if (!result.ok) return NextResponse.json({ error: "Profile service unavailable" }, { status: 503 });
  const storedUser = managedUserFromPayload(result.payload);
  if (result.status !== 200 || !storedUser) {
    const error = result.payload && typeof result.payload === "object" && "error" in result.payload
      ? String((result.payload as { error: unknown }).error) : "Profile update failed";
    return NextResponse.json({ error }, { status: result.status });
  }
  clearAccessPrincipalCache(context.auth.identity.email);
  return NextResponse.json({
    profile: directoryUser(storedUser, storedUser.email, context.auth.identity.email, {
      ...context.principal,
      managedUser: storedUser,
    }),
  }, { headers: { "Cache-Control": "no-store" } });
}
