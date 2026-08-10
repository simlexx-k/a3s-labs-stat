import { type NextRequest, NextResponse } from "next/server";
import { authenticateCloudflareAccess } from "@/lib/cloudflare-access";

export async function proxy(request: NextRequest) {
  const auth = await authenticateCloudflareAccess(request);
  if (auth.ok) return NextResponse.next();

  const headers = { "Cache-Control": "no-store, max-age=0" };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  return new NextResponse(auth.error, {
    status: auth.status,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
