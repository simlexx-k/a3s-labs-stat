import "server-only";

import type { NextRequest } from "next/server";
import { resolveAccessPrincipal, roleAllows, type AccessRole } from "@/lib/access-role";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";

export async function accessContext(request: NextRequest, minimumRole?: AccessRole) {
  const auth = await authenticateCloudflareAccess(request);
  if (!auth.ok) return { ok: false as const, error: auth.error, status: auth.status };
  const principal = await resolveAccessPrincipal(auth, request.nextUrl.origin);
  if (principal.status === "suspended") {
    return { ok: false as const, error: "Account suspended", status: 403 as const };
  }
  if (minimumRole && !roleAllows(principal.role, minimumRole)) {
    return { ok: false as const, error: "Administrator access required", status: 403 as const };
  }
  return { ok: true as const, auth, principal };
}

export function requestOriginAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}
