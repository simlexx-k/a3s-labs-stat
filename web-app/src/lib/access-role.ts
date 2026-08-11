import "server-only";

import type { AccessAuthResult } from "@/lib/cloudflare-access";
import { requestTelemetryInternal } from "@/lib/telemetry-internal";

export type AccessRole = "viewer" | "operator" | "admin";
export type AccessStatus = "active" | "suspended";

export type ManagedUserRecord = {
  email: string;
  display_name: string;
  title: string;
  timezone: string;
  role: AccessRole;
  status: AccessStatus;
  created_at: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
};

export type AccessPrincipal = {
  directoryAvailable: boolean;
  managedUser: ManagedUserRecord | null;
  role: AccessRole;
  roleSource: "default" | "environment" | "managed";
  status: AccessStatus;
};

const rank: Record<AccessRole, number> = { viewer: 0, operator: 1, admin: 2 };
const principalCache = new Map<string, { expiresAt: number; promise: Promise<AccessPrincipal> }>();

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

export function configuredRoleForEmail(email: string): AccessRole | null {
  const normalized = email.trim().toLowerCase();
  if (emailSet("ISTATUS_ADMIN_EMAILS").has(normalized)) return "admin";
  if (emailSet("ISTATUS_OPERATOR_EMAILS").has(normalized)) return "operator";
  return null;
}

export function configuredUsers() {
  const users = new Map<string, AccessRole>();
  emailSet("ISTATUS_OPERATOR_EMAILS").forEach((email) => users.set(email, "operator"));
  emailSet("ISTATUS_ADMIN_EMAILS").forEach((email) => users.set(email, "admin"));
  return users;
}

function managedUser(payload: unknown): ManagedUserRecord | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = (payload as { user?: unknown }).user;
  if (!candidate || typeof candidate !== "object") return null;
  const user = candidate as Partial<ManagedUserRecord>;
  if (
    typeof user.email !== "string"
    || typeof user.display_name !== "string"
    || typeof user.title !== "string"
    || typeof user.timezone !== "string"
    || !user.role || !(user.role in rank)
    || (user.status !== "active" && user.status !== "suspended")
  ) return null;
  return user as ManagedUserRecord;
}

async function loadAccessPrincipal(
  auth: Extract<AccessAuthResult, { ok: true }>,
  requestOrigin: string,
): Promise<AccessPrincipal> {
  const environmentRole = accessRole(auth);
  if (auth.developmentBypass) {
    return { directoryAvailable: true, managedUser: null, role: "admin", roleSource: "environment", status: "active" };
  }

  const result = await requestTelemetryInternal("users/resolve", requestOrigin, {
    searchParams: new URLSearchParams({ email: auth.identity.email }),
  });
  if (!result.ok || result.status !== 200) {
    return {
      directoryAvailable: false,
      managedUser: null,
      role: environmentRole,
      roleSource: environmentRole === "viewer" ? "default" : "environment",
      status: "active",
    };
  }

  const user = managedUser(result.payload);
  const managedRole = user?.role ?? "viewer";
  const role = rank[managedRole] > rank[environmentRole] ? managedRole : environmentRole;
  const environmentAdmin = environmentRole === "admin";
  return {
    directoryAvailable: true,
    managedUser: user,
    role,
    roleSource: rank[managedRole] > rank[environmentRole]
      ? "managed"
      : environmentRole === "viewer" ? (user ? "managed" : "default") : "environment",
    status: environmentAdmin ? "active" : user?.status ?? "active",
  };
}

export function clearAccessPrincipalCache(email?: string) {
  if (!email) {
    principalCache.clear();
    return;
  }
  const suffix = `|${email.trim().toLowerCase()}`;
  for (const key of principalCache.keys()) {
    if (key.endsWith(suffix)) principalCache.delete(key);
  }
}

export async function resolveAccessPrincipal(
  auth: Extract<AccessAuthResult, { ok: true }>,
  requestOrigin: string,
): Promise<AccessPrincipal> {
  const key = `${requestOrigin}|${auth.identity.email}`;
  const cached = principalCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = loadAccessPrincipal(auth, requestOrigin);
  principalCache.set(key, { expiresAt: Date.now() + 10_000, promise });
  return promise;
}

export function roleAllows(role: AccessRole, minimum: AccessRole) {
  return rank[role] >= rank[minimum];
}
