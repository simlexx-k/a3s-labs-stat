"use client";

import { Download, LoaderCircle, Plus, RefreshCw, Search, ShieldAlert, UserRound, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfrastructureShell } from "@/components/layout/infrastructure-shell";
import { IconButton } from "@/components/ui/icon-button";
import { accessFetch, isAccessSessionExpired } from "@/lib/access-client";
import type { DirectoryUser, UserDirectoryResponse } from "@/lib/user-directory";
import { userInitials } from "@/lib/user-directory";

type RoleFilter = "all" | DirectoryUser["role"];
type StatusFilter = "all" | DirectoryUser["status"];
type UserDraft = Pick<DirectoryUser, "display_name" | "email" | "role" | "status" | "timezone" | "title">;

const emptyUser: UserDraft = { display_name: "", email: "", role: "viewer", status: "active", timezone: "UTC", title: "" };
const timezones = ["UTC", "Africa/Nairobi", "Africa/Johannesburg", "Europe/London", "America/New_York", "Asia/Dubai"];
const roleRank = { viewer: 0, operator: 1, admin: 2 } as const;

function date(value: number | null) {
  return value ? new Date(value * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "Not recorded";
}

async function responseError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

function csvCell(value: string | number | null) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function userSummary(users: DirectoryUser[]) {
  return {
    active: users.filter((user) => user.status === "active").length,
    admins: users.filter((user) => user.role === "admin").length,
    suspended: users.filter((user) => user.status === "suspended").length,
    total: users.length,
  };
}

export function UsersWorkspace() {
  const [data, setData] = useState<UserDirectoryResponse | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [draft, setDraft] = useState<UserDraft>(emptyUser);
  const [createDraft, setCreateDraft] = useState<UserDraft>(emptyUser);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedEmailRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await accessFetch("/api/users", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, response.status === 403 ? "Administrator access required" : "User directory unavailable"));
      const directory = await response.json() as UserDirectoryResponse;
      const selectedUser = directory.users.find((user) => user.email === selectedEmailRef.current)
        ?? directory.users.find((user) => user.email === directory.current_user)
        ?? directory.users[0]
        ?? null;
      setData(directory);
      selectedEmailRef.current = selectedUser?.email ?? null;
      setSelectedEmail(selectedUser?.email ?? null);
      if (selectedUser) setDraft({ display_name: selectedUser.display_name, email: selectedUser.email, role: selectedUser.role, status: selectedUser.status, timezone: selectedUser.timezone, title: selectedUser.title });
      setError(null);
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "User directory unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const selected = useMemo(() => data?.users.find((user) => user.email === selectedEmail) ?? null, [data, selectedEmail]);

  const selectUser = (user: DirectoryUser) => {
    selectedEmailRef.current = user.email;
    setSelectedEmail(user.email);
    setDraft({ display_name: user.display_name, email: user.email, role: user.role, status: user.status, timezone: user.timezone, title: user.title });
  };

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.users ?? []).filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      return !query || `${user.display_name} ${user.email} ${user.title}`.toLowerCase().includes(query);
    });
  }, [data, roleFilter, search, statusFilter]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2800);
  };

  const updateSelected = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const response = await accessFetch(`/api/users/${encodeURIComponent(selected.email)}`, {
        body: JSON.stringify({ display_name: draft.display_name, role: draft.role, status: draft.status, timezone: draft.timezone, title: draft.title }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(await responseError(response, "User update failed"));
      const payload = await response.json() as { user: DirectoryUser };
      setData((current) => {
        if (!current) return current;
        const users = current.users.map((user) => user.email === payload.user.email ? payload.user : user);
        return { ...current, summary: userSummary(users), users };
      });
      setError(null);
      notify("User changes saved");
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "User update failed");
    } finally {
      setSaving(false);
    }
  };

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await accessFetch("/api/users", {
        body: JSON.stringify(createDraft),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(await responseError(response, "User creation failed"));
      const payload = await response.json() as { user: DirectoryUser };
      setData((current) => {
        if (!current) return current;
        const users = [...current.users, payload.user].sort((a, b) => a.email.localeCompare(b.email));
        return { ...current, summary: userSummary(users), users };
      });
      selectedEmailRef.current = payload.user.email;
      setSelectedEmail(payload.user.email);
      setDraft({ display_name: payload.user.display_name, email: payload.user.email, role: payload.user.role, status: payload.user.status, timezone: payload.user.timezone, title: payload.user.title });
      setCreateDraft(emptyUser);
      setShowCreate(false);
      setError(null);
      notify("User added to the directory");
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "User creation failed");
    } finally {
      setCreating(false);
    }
  };

  const exportUsers = () => {
    const rows = [
      ["email", "display_name", "title", "role", "status", "timezone", "source", "updated_at"],
      ...visibleUsers.map((user) => [user.email, user.display_name, user.title, user.role, user.status, user.timezone, user.source, user.updated_at ? new Date(user.updated_at * 1000).toISOString() : ""]),
    ];
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `istatus-users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <InfrastructureShell
      activeView="users"
      connectionLabel={error ? "Directory interrupted" : "Directory available"}
      connectionTone={error ? "error" : data ? "live" : "pending"}
      locationTitle="User management"
      topbarActions={<IconButton disabled={loading} label="Refresh users" onClick={() => void load()}><RefreshCw className={loading ? "spin" : undefined} size={18} /></IconButton>}
    >
      <header className="operations-heading users-heading">
        <div><p className="eyebrow">Administration</p><h1>User management</h1><p>Workspace authorization, account status, and profile metadata.</p></div>
        <div className="operations-heading-actions"><button className="secondary-command" disabled={!visibleUsers.length} onClick={exportUsers} type="button"><Download size={15} />Export</button><button className="primary-command" onClick={() => setShowCreate(true)} type="button"><Plus size={15} />Add user</button></div>
      </header>

      {error ? <div className="status-banner error" role="alert"><ShieldAlert size={18} /><div><strong>User directory issue</strong><span>{error}</span></div><button onClick={() => void load()} type="button">Retry</button></div> : null}
      {notice ? <div className="users-notice" aria-live="polite">{notice}</div> : null}

      <section className="operations-summary" aria-label="User summary">
        <div><span>Total users</span><strong>{data?.summary.total ?? "--"}</strong><small>directory entries</small></div>
        <div><span>Active</span><strong>{data?.summary.active ?? "--"}</strong><small>workspace access</small></div>
        <div><span>Administrators</span><strong>{data?.summary.admins ?? "--"}</strong><small>full management</small></div>
        <div><span>Suspended</span><strong className={data?.summary.suspended ? "critical-text" : undefined}>{data?.summary.suspended ?? "--"}</strong><small>access blocked</small></div>
      </section>

      <div className="users-directory-grid">
        <section className="panel users-list-panel">
          <div className="users-toolbar">
            <label className="users-search"><Search aria-hidden="true" size={15} /><span className="sr-only">Search users</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search users" value={search} /></label>
            <label className="compact-select"><span>Role</span><select aria-label="Role filter" onChange={(event) => setRoleFilter(event.target.value as RoleFilter)} value={roleFilter}><option value="all">All roles</option><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select></label>
            <label className="compact-select"><span>Status</span><select aria-label="Status filter" onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} value={statusFilter}><option value="all">All states</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
          </div>
          <div className="users-list" role="list" aria-label="Users">
            {loading ? <div className="users-empty"><LoaderCircle className="spin" size={19} />Loading user directory</div> : visibleUsers.map((user) => (
              <button aria-current={selectedEmail === user.email ? "true" : undefined} className="users-list-item" key={user.email} onClick={() => selectUser(user)} role="listitem" type="button">
                <span className="user-avatar">{userInitials(user)}</span>
                <span className="user-list-identity"><strong>{user.display_name || user.email}</strong><small>{user.email}</small><em>{user.title || "No job title"}</em></span>
                <span className="user-list-access"><span className={`role-badge ${user.role}`}>{user.role}</span><small className={user.status}>{user.status}</small></span>
              </button>
            ))}
            {!loading && !visibleUsers.length ? <div className="users-empty"><UsersRound size={20} />No users match these filters</div> : null}
          </div>
          <footer className="users-list-footer"><span>Showing {visibleUsers.length} of {data?.users.length ?? 0}</span><span>Sign-in policy: Cloudflare Access</span></footer>
        </section>

        <section className="panel user-editor-panel">
          <div className="panel-heading"><div><p className="eyebrow">Selected user</p><h2>{selected?.display_name || selected?.email || "No selection"}</h2></div>{selected ? <span className={`state-label ${selected.status === "active" ? "resolved" : ""}`}>{selected.status}</span> : null}</div>
          {selected ? <form className="user-editor-form" onSubmit={updateSelected}>
            <div className="user-editor-identity"><span className="user-avatar large">{userInitials(selected)}</span><div><strong>{selected.email}</strong><span>Added {date(selected.created_at)} · {selected.source} source</span></div></div>
            <div className="user-form-grid">
              <label><span>Display name</span><input maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, display_name: event.target.value }))} value={draft.display_name} /></label>
              <label><span>Job title</span><input maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} value={draft.title} /></label>
              <label><span>Role</span><select disabled={selected.current_user} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as DirectoryUser["role"] }))} value={draft.role}>{(["viewer", "operator", "admin"] as const).map((role) => <option disabled={Boolean(selected.minimum_role && roleRank[role] < roleRank[selected.minimum_role])} key={role} value={role}>{role}</option>)}</select></label>
              <label><span>Status</span><select disabled={selected.current_user} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as DirectoryUser["status"] }))} value={draft.status}><option value="active">Active</option><option disabled={selected.minimum_role === "admin"} value="suspended">Suspended</option></select></label>
              <label className="user-timezone-field"><span>Timezone</span><select onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} value={draft.timezone}>{timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
            </div>
            {selected.current_user ? <p className="user-editor-note">Your own role and account status require another administrator.</p> : selected.minimum_role ? <p className="user-editor-note">Environment configuration sets a minimum {selected.minimum_role} role for this account.</p> : null}
            <div className="user-editor-meta"><span>Updated {date(selected.updated_at)}</span><span>by {selected.updated_by || "system"}</span></div>
            <div className="user-editor-actions"><button className="primary-command" disabled={saving} type="submit">{saving ? <LoaderCircle className="spin" size={15} /> : null}{saving ? "Saving" : "Save changes"}</button></div>
          </form> : <div className="users-empty"><UserRound size={20} />Select a user to manage</div>}
        </section>
      </div>

      {showCreate ? <div className="dialog-scrim" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowCreate(false); }}><section aria-labelledby="create-user-title" aria-modal="true" className="user-create-dialog" role="dialog"><header><div><p className="eyebrow">Workspace access</p><h2 id="create-user-title">Add user</h2></div><IconButton label="Close dialog" onClick={() => setShowCreate(false)}><X size={17} /></IconButton></header><form onSubmit={createUser}>
        <div className="user-form-grid"><label className="user-email-field"><span>Email address</span><input autoComplete="email" maxLength={254} onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))} placeholder="name@company.com" required type="email" value={createDraft.email} /></label><label><span>Display name</span><input maxLength={80} onChange={(event) => setCreateDraft((current) => ({ ...current, display_name: event.target.value }))} value={createDraft.display_name} /></label><label><span>Job title</span><input maxLength={100} onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))} value={createDraft.title} /></label><label><span>Role</span><select onChange={(event) => setCreateDraft((current) => ({ ...current, role: event.target.value as DirectoryUser["role"] }))} value={createDraft.role}><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select></label><label><span>Status</span><select onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value as DirectoryUser["status"] }))} value={createDraft.status}><option value="active">Active</option><option value="suspended">Suspended</option></select></label><label><span>Timezone</span><select onChange={(event) => setCreateDraft((current) => ({ ...current, timezone: event.target.value }))} value={createDraft.timezone}>{timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label></div>
        <p>Cloudflare Access must also allow this email to sign in. This entry assigns its iStatus role and profile.</p><footer><button className="secondary-command" onClick={() => setShowCreate(false)} type="button">Cancel</button><button className="primary-command" disabled={creating} type="submit">{creating ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}{creating ? "Adding" : "Add user"}</button></footer>
      </form></section></div> : null}
    </InfrastructureShell>
  );
}
