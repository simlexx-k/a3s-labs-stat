import { type NextRequest, NextResponse } from "next/server";
import { accessContext, requestOriginAllowed } from "@/lib/access-server";
import { clearAccessPrincipalCache, configuredRoleForEmail, roleAllows } from "@/lib/access-role";
import { requestTelemetryInternal } from "@/lib/telemetry-internal";
import {
  directoryUser,
  managedUserFromPayload,
  validEmail,
  validRole,
  validText,
  validTimezone,
} from "@/lib/user-directory-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  if (!requestOriginAllowed(request)) return NextResponse.json({ error: "Request origin denied" }, { status: 403 });
  const context = await accessContext(request, "admin");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const targetEmail = validEmail((await params).email);
  if (!targetEmail) return NextResponse.json({ error: "Invalid user" }, { status: 400 });

  let changes: Record<string, string>;
  try {
    const body = await request.json() as Record<string, unknown>;
    changes = {};
    if ("display_name" in body) {
      const value = validText(body.display_name, 80);
      if (value === null) throw new Error();
      changes.display_name = value;
    }
    if ("title" in body) {
      const value = validText(body.title, 100);
      if (value === null) throw new Error();
      changes.title = value;
    }
    if ("timezone" in body) {
      const value = validTimezone(body.timezone);
      if (!value) throw new Error();
      changes.timezone = value;
    }
    if ("role" in body) {
      const value = validRole(body.role);
      if (!value) throw new Error();
      changes.role = value;
    }
    if ("status" in body) {
      if (body.status !== "active" && body.status !== "suspended") throw new Error();
      changes.status = body.status;
    }
    if (!Object.keys(changes).length) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid user update" }, { status: 400 });
  }

  if (targetEmail === context.auth.identity.email && (changes.role || changes.status)) {
    return NextResponse.json({ error: "Use another administrator to change your own access" }, { status: 409 });
  }
  const minimumRole = configuredRoleForEmail(targetEmail);
  if (minimumRole && changes.role && !roleAllows(changes.role as "viewer" | "operator" | "admin", minimumRole)) {
    return NextResponse.json({ error: `Environment configuration requires ${minimumRole} access` }, { status: 409 });
  }
  if (minimumRole === "admin" && changes.status === "suspended") {
    return NextResponse.json({ error: "Environment administrators cannot be suspended" }, { status: 409 });
  }

  const result = await requestTelemetryInternal(`users/${encodeURIComponent(targetEmail)}`, request.nextUrl.origin, {
    actor: context.auth.identity.email,
    body: changes,
    method: "POST",
  });
  if (!result.ok) return NextResponse.json({ error: "User directory unavailable" }, { status: 503 });
  const user = managedUserFromPayload(result.payload);
  if (result.status !== 200 || !user) {
    const error = result.payload && typeof result.payload === "object" && "error" in result.payload
      ? String((result.payload as { error: unknown }).error) : "User update failed";
    return NextResponse.json({ error }, { status: result.status });
  }
  clearAccessPrincipalCache(targetEmail);
  return NextResponse.json({ user: directoryUser(user, user.email, context.auth.identity.email) });
}
