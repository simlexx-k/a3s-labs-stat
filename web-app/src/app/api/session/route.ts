import { type NextRequest, NextResponse } from "next/server";
import { resolveAccessPrincipal } from "@/lib/access-role";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateCloudflareAccess(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const principal = await resolveAccessPrincipal(auth, request.nextUrl.origin);
  return NextResponse.json({
    display_name: principal.managedUser?.display_name ?? "",
    email: auth.identity.email,
    issued_at: auth.identity.issuedAt,
    role: principal.role,
    role_source: principal.roleSource,
    status: principal.status,
    title: principal.managedUser?.title ?? "",
    expires_at: auth.identity.expiresAt,
  }, { headers: { "Cache-Control": "no-store" } });
}
