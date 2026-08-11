import "server-only";

import {
  configuredRoleForEmail,
  configuredUsers,
  roleAllows,
  type AccessPrincipal,
  type AccessRole,
  type ManagedUserRecord,
} from "@/lib/access-role";
import type { DirectoryUser, UserDirectoryResponse } from "@/lib/user-directory";

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const roles = new Set<AccessRole>(["viewer", "operator", "admin"]);

export function validEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length <= 254 && emailPattern.test(email) ? email : null;
}

export function validText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= maximum ? text : null;
}

export function validTimezone(value: unknown) {
  const timezone = validText(value, 64);
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return null;
  }
}

export function validRole(value: unknown): AccessRole | null {
  return typeof value === "string" && roles.has(value as AccessRole) ? value as AccessRole : null;
}

export function managedUserFromPayload(payload: unknown): ManagedUserRecord | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = (payload as { user?: unknown }).user;
  if (!candidate || typeof candidate !== "object") return null;
  const user = candidate as Partial<ManagedUserRecord>;
  if (
    !validEmail(user.email)
    || typeof user.display_name !== "string"
    || typeof user.title !== "string"
    || typeof user.timezone !== "string"
    || !validRole(user.role)
    || (user.status !== "active" && user.status !== "suspended")
    || typeof user.created_at !== "number"
    || typeof user.updated_at !== "number"
    || typeof user.created_by !== "string"
    || typeof user.updated_by !== "string"
  ) return null;
  return user as ManagedUserRecord;
}

export function directoryUser(
  user: ManagedUserRecord | null,
  email: string,
  currentUser: string,
  principal?: AccessPrincipal,
): DirectoryUser {
  const minimumRole = configuredRoleForEmail(email);
  let role = user?.role ?? minimumRole ?? "viewer";
  if (minimumRole && !roleAllows(role, minimumRole)) role = minimumRole;
  if (principal && email === currentUser) role = principal.role;
  const environmentAdmin = minimumRole === "admin";
  return {
    created_at: user?.created_at ?? null,
    created_by: user?.created_by ?? "Environment configuration",
    current_user: email === currentUser,
    display_name: user?.display_name ?? "",
    email,
    minimum_role: minimumRole,
    role,
    source: user ? "managed" : "environment",
    status: environmentAdmin ? "active" : user?.status ?? "active",
    timezone: user?.timezone ?? "UTC",
    title: user?.title ?? "",
    updated_at: user?.updated_at ?? null,
    updated_by: user?.updated_by ?? "Environment configuration",
  };
}

export function mergeUserDirectory(
  storedUsers: ManagedUserRecord[],
  currentUser: string,
): UserDirectoryResponse {
  const merged = new Map(storedUsers.map((user) => [user.email, directoryUser(user, user.email, currentUser)]));
  configuredUsers().forEach((_role, email) => {
    const stored = storedUsers.find((user) => user.email === email) ?? null;
    merged.set(email, directoryUser(stored, email, currentUser));
  });
  const users = [...merged.values()].sort((left, right) =>
    (left.display_name || left.email).localeCompare(right.display_name || right.email),
  );
  return {
    current_user: currentUser,
    summary: {
      active: users.filter((user) => user.status === "active").length,
      admins: users.filter((user) => user.role === "admin").length,
      suspended: users.filter((user) => user.status === "suspended").length,
      total: users.length,
    },
    users,
  };
}
