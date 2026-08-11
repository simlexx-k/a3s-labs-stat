import "server-only";

import type { AccessAuthResult } from "@/lib/cloudflare-access";

export type AccessRole = "viewer" | "operator" | "admin";

const rank: Record<AccessRole, number> = { viewer: 0, operator: 1, admin: 2 };

function emailSet(name: "ISTATUS_OPERATOR_EMAILS" | "ISTATUS_ADMIN_EMAILS") {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function accessRole(auth: Extract<AccessAuthResult, { ok: true }>): AccessRole {
  if (auth.developmentBypass) return "admin";
  const email = auth.identity.email.toLowerCase();
  if (emailSet("ISTATUS_ADMIN_EMAILS").has(email)) return "admin";
  if (emailSet("ISTATUS_OPERATOR_EMAILS").has(email)) return "operator";
  return "viewer";
}

export function roleAllows(role: AccessRole, minimum: AccessRole) {
  return rank[role] >= rank[minimum];
}
