"use client";

import { Check, Clock3, KeyRound, LoaderCircle, Mail, Save, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { InfrastructureShell } from "@/components/layout/infrastructure-shell";
import { WorkspaceNotice, WorkspacePageHeader, WorkspacePanel } from "@/components/layout/workspace-ui";
import { accessFetch, isAccessSessionExpired } from "@/lib/access-client";
import type { ProfileResponse } from "@/lib/user-directory";
import { userInitials } from "@/lib/user-directory";

const timezones = ["UTC", "Africa/Nairobi", "Africa/Johannesburg", "Europe/London", "America/New_York", "Asia/Dubai"];

function sessionTime(value: number | null | undefined) {
  return value ? new Date(value * 1000).toLocaleString() : "Not available";
}

async function responseError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

export function AccountWorkspace() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await accessFetch("/api/profile", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Profile unavailable"));
      const profile = await response.json() as ProfileResponse;
      setData(profile);
      setDisplayName(profile.profile.display_name);
      setTitle(profile.profile.title);
      setTimezone(profile.profile.timezone || "UTC");
      setError(null);
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "Profile unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const response = await accessFetch("/api/profile", {
        body: JSON.stringify({ display_name: displayName, timezone, title }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(await responseError(response, "Profile update failed"));
      const updated = await response.json() as Pick<ProfileResponse, "profile">;
      setData((current) => current ? { ...current, profile: updated.profile } : current);
      setError(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "Profile update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <InfrastructureShell
      activeView="profile"
      connectionLabel={error ? "Identity interrupted" : "Identity verified"}
      connectionTone={error ? "error" : data ? "live" : "pending"}
      connectionDetail="Cloudflare Access"
      locationTitle="My profile"
    >
      <WorkspacePageHeader
        actions={data ? <span className={`role-badge ${data.profile.role}`}>{data.profile.role}</span> : null}
        description="Identity details, workspace role, and session information."
        eyebrow="Account"
        title="My profile"
      />

      {error ? <WorkspaceNotice icon={<UserRound />} onAction={() => void load()} title="Profile unavailable" tone="danger">{error}</WorkspaceNotice> : null}

      <section className="account-identity-band" aria-label="Current identity">
        <div className="account-avatar">{data ? userInitials(data.profile) : "--"}</div>
        <div className="account-identity-copy">
          <strong>{data?.profile.display_name || data?.profile.email || "Loading identity"}</strong>
          <span>{data?.profile.title || "Infrastructure workspace member"}</span>
          <small>{data?.profile.email || "Verifying Cloudflare Access session"}</small>
        </div>
        <div className="account-state"><span className={`state-label ${data?.profile.status === "active" ? "resolved" : ""}`}>{data?.profile.status || "pending"}</span><small>{data?.profile.source || "managed"} authorization</small></div>
      </section>

      <div className="account-grid">
        <WorkspacePanel action={<UserRound size={17} />} className="account-panel" eyebrow="Profile" title="Personal details">
          {loading ? <div className="account-loading"><LoaderCircle className="spin" size={18} />Loading profile</div> : (
            <form className="account-form" onSubmit={save}>
              <label><span>Display name</span><input autoComplete="name" maxLength={80} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" value={displayName} /></label>
              <label><span>Job title</span><input autoComplete="organization-title" maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="Infrastructure engineer" value={title} /></label>
              <label><span>Timezone</span><select onChange={(event) => setTimezone(event.target.value)} value={timezone}>{timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
              <div className="account-form-footer">
                <span aria-live="polite">{saved ? <><Check size={14} />Profile saved</> : "Changes apply across iStatus."}</span>
                <button className="primary-command" disabled={saving} type="submit">{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{saving ? "Saving" : "Save profile"}</button>
              </div>
            </form>
          )}
        </WorkspacePanel>

        <WorkspacePanel action={<ShieldCheck size={17} />} className="account-panel" eyebrow="Security" title="Identity and access">
          <dl className="account-security-list">
            <div><dt><Mail size={15} />Email</dt><dd>{data?.profile.email || "--"}</dd></div>
            <div><dt><KeyRound size={15} />Provider</dt><dd>{data?.session.identity_provider || "Cloudflare Access"}</dd></div>
            <div><dt><ShieldCheck size={15} />Authorization</dt><dd><span className={`role-badge ${data?.profile.role}`}>{data?.profile.role || "--"}</span><small>{data?.profile.source || "--"} source</small></dd></div>
            <div><dt><Clock3 size={15} />Session issued</dt><dd>{sessionTime(data?.session.issued_at)}</dd></div>
            <div><dt><Clock3 size={15} />Session expires</dt><dd>{sessionTime(data?.session.expires_at)}</dd></div>
          </dl>
          <div className="account-security-footer"><span>Authentication and one-time codes are managed by Cloudflare Access.</span><a className="secondary-command" href="/logout">End session</a></div>
        </WorkspacePanel>
      </div>
    </InfrastructureShell>
  );
}
