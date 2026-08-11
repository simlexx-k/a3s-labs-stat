import { type NextRequest, NextResponse } from "next/server";
import { accessContext, requestOriginAllowed } from "@/lib/access-server";
import { clearAccessPrincipalCache, type ManagedUserRecord } from "@/lib/access-role";
import { requestTelemetryInternal } from "@/lib/telemetry-internal";
import {
  directoryUser,
  managedUserFromPayload,
  mergeUserDirectory,
  validEmail,
  validRole,
  validText,
  validTimezone,
} from "@/lib/user-directory-server";

export const dynamic = "force-dynamic";

function storedUsers(payload: unknown) {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { users?: unknown }).users)) return null;
  const users = (payload as { users: unknown[] }).users
    .map((user) => managedUserFromPayload({ user }))
    .filter((user): user is ManagedUserRecord => Boolean(user));
  return users;
}

export async function GET(request: NextRequest) {
  const context = await accessContext(request, "admin");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const result = await requestTelemetryInternal("users", request.nextUrl.origin);
  if (!result.ok || result.status !== 200) return NextResponse.json({ error: "User directory unavailable" }, { status: 503 });
  const users = storedUsers(result.payload);
  if (!users) return NextResponse.json({ error: "User directory unavailable" }, { status: 502 });
  return NextResponse.json(mergeUserDirectory(users, context.auth.identity.email), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) return NextResponse.json({ error: "Request origin denied" }, { status: 403 });
  const context = await accessContext(request, "admin");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  let payload: { display_name: string; email: string; role: string; status: string; timezone: string; title: string };
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = validEmail(body.email);
    const displayName = validText(body.display_name, 80);
    const title = validText(body.title, 100);
    const timezone = validTimezone(body.timezone);
    const role = validRole(body.role);
    const status = body.status === "active" || body.status === "suspended" ? body.status : null;
    if (!email || displayName === null || title === null || !timezone || !role || !status) throw new Error();
    payload = { display_name: displayName, email, role, status, timezone, title };
  } catch {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  const result = await requestTelemetryInternal("users", request.nextUrl.origin, {
    actor: context.auth.identity.email,
    body: payload,
    method: "POST",
  });
  if (!result.ok) return NextResponse.json({ error: "User directory unavailable" }, { status: 503 });
  const user = managedUserFromPayload(result.payload);
  if ((result.status !== 200 && result.status !== 201) || !user) {
    const error = result.payload && typeof result.payload === "object" && "error" in result.payload
      ? String((result.payload as { error: unknown }).error) : "User creation failed";
    return NextResponse.json({ error }, { status: result.status });
  }
  clearAccessPrincipalCache(user.email);
  return NextResponse.json({ user: directoryUser(user, user.email, context.auth.identity.email) }, { status: 201 });
}
