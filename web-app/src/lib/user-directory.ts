import type { AccessRole, AccessStatus } from "@/lib/access-role";

export type DirectoryUser = {
  created_at: number | null;
  created_by: string;
  current_user: boolean;
  display_name: string;
  email: string;
  minimum_role: AccessRole | null;
  role: AccessRole;
  source: "environment" | "managed";
  status: AccessStatus;
  timezone: string;
  title: string;
  updated_at: number | null;
  updated_by: string;
};

export type UserDirectoryResponse = {
  current_user: string;
  summary: { active: number; admins: number; suspended: number; total: number };
  users: DirectoryUser[];
};

export type ProfileResponse = {
  profile: DirectoryUser;
  session: {
    expires_at: number | null;
    identity_provider: "Cloudflare Access";
    issued_at: number | null;
    subject: string | null;
  };
};

export function userInitials(user: Pick<DirectoryUser, "display_name" | "email">) {
  const source = user.display_name.trim() || user.email.split("@")[0];
  const words = source.split(/[\s._-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "U";
}
