import { type NextRequest, NextResponse } from "next/server";
import { accessRole } from "@/lib/access-role";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateCloudflareAccess(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({
    email: auth.identity.email,
    role: accessRole(auth),
    expires_at: auth.identity.expiresAt,
  }, { headers: { "Cache-Control": "no-store" } });
}
