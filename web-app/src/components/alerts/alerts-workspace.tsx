"use client";

import { Bell, Check, Download, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InfrastructureShell } from "@/components/layout/infrastructure-shell";
import { WorkspaceNotice, WorkspacePageHeader, WorkspacePanel, WorkspaceSummary } from "@/components/layout/workspace-ui";
import { IconButton } from "@/components/ui/icon-button";
import { accessFetch, isAccessSessionExpired } from "@/lib/access-client";
import type { AccessSession, AlertsResponse, AlertState, AuditEvent, Stats } from "@/lib/telemetry";

type StatusFilter = "active" | "all";
type SeverityFilter = "all" | "critical" | "warning";

function timestamp(value: number | null) {
  return value ? new Date(value * 1000).toLocaleString() : "Not recorded";
}

function alertValue(alert: AlertState) {
  if (alert.value === null) return "State based";
  return `${alert.value.toFixed(alert.unit === "%" ? 1 : 0)}${alert.unit === "%" ? "%" : alert.unit ? ` ${alert.unit}` : ""}`;
}

export function AlertsWorkspace() {
  const [alerts, setAlerts] = useState<AlertsResponse>({ summary: { active: 0, critical: 0, acknowledged: 0 }, alerts: [] });
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [session, setSession] = useState<AccessSession | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [alertsResponse, auditResponse, sessionResponse, statsResponse] = await Promise.all([
        accessFetch("/api/alerts?include_resolved=true", { cache: "no-store" }),
        accessFetch("/api/audit?limit=50", { cache: "no-store" }),
        accessFetch("/api/session", { cache: "no-store" }),
        accessFetch("/api/stats", { cache: "no-store" }),
      ]);
      if (!alertsResponse.ok || !auditResponse.ok || !sessionResponse.ok || !statsResponse.ok) throw new Error("Alert service unavailable");
      setAlerts(await alertsResponse.json() as AlertsResponse);
      setAudit((await auditResponse.json() as { events: AuditEvent[] }).events);
      setSession(await sessionResponse.json() as AccessSession);
      setStats(await statsResponse.json() as Stats);
      setError(null);
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "Alert service unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 15_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return alerts.alerts.filter((alert) => {
      if (status === "active" && alert.status !== "active") return false;
      if (severity !== "all" && alert.severity !== severity) return false;
      return !query || `${alert.title} ${alert.target_name ?? ""} ${alert.category}`.toLowerCase().includes(query);
    });
  }, [alerts.alerts, search, severity, status]);

  const acknowledge = async (alert: AlertState) => {
    setAcknowledging(alert.alert_key);
    try {
      const response = await accessFetch(`/api/alerts/${encodeURIComponent(alert.alert_key)}/acknowledge`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to acknowledge alert");
      await load();
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "Unable to acknowledge alert");
    } finally {
      setAcknowledging(null);
    }
  };

  const exportCsv = () => {
    const csv = [
      "title,severity,status,target,value,opened_at,acknowledged_by",
      ...visible.map((alert) => [alert.title, alert.severity, alert.status, alert.target_name ?? "host", alertValue(alert), timestamp(alert.opened_at), alert.acknowledged_by ?? ""].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `istatus-alerts-${new Date().toISOString().replaceAll(":", "-")}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const canOperate = session?.role === "operator" || session?.role === "admin";
  return (
    <InfrastructureShell
      activeView="alerts"
      connectionLabel={error ? "Alerts interrupted" : "Alert engine active"}
      connectionTone={error ? "error" : loading ? "pending" : "live"}
      containerCount={stats?.docker.summary.containers_total}
      hostname={stats?.vps.hostname}
      lastUpdated={stats?.collected_at ? new Date(stats.collected_at) : null}
      locationTitle="Alerts and audit"
      topbarActions={<IconButton label="Refresh alerts" onClick={() => void load()} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : undefined} size={18} /></IconButton>}
    >
      <WorkspacePageHeader
        actions={<><span className={`role-badge ${session?.role ?? "viewer"}`}>{session?.role ?? "viewer"}</span><IconButton label="Export visible alerts as CSV" onClick={exportCsv} disabled={!visible.length}><Download size={17} /></IconButton></>}
        description="Active resource, availability, health, and restart conditions."
        eyebrow="Operations"
        title="Alerts"
      />

      {error ? <WorkspaceNotice icon={<ShieldAlert />} onAction={() => void load()} title="Alert updates interrupted" tone="danger">{error}</WorkspaceNotice> : null}

      <WorkspaceSummary ariaLabel="Alert summary" items={[
        { detail: "open conditions", label: "Active", value: alerts.summary.active },
        { detail: "requires attention", label: "Critical", tone: "danger", value: alerts.summary.critical },
        { detail: "active alerts", label: "Acknowledged", value: alerts.summary.acknowledged },
        { detail: "retained states", label: "Resolved", value: alerts.alerts.filter((alert) => alert.status === "resolved").length },
      ]} />

      <WorkspacePanel className="alerts-panel">
        <div className="table-toolbar alerts-toolbar">
          <label className="search-field"><Search size={16} /><span className="sr-only">Search alerts</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search alerts" type="search" value={search} /></label>
          <div className="alerts-filter-group">
            <div className="segment-control" aria-label="Alert status" role="group">{(["active", "all"] as const).map((value) => <button aria-pressed={status === value} key={value} onClick={() => setStatus(value)} type="button">{value}</button>)}</div>
            <label className="compact-select"><span>Severity</span><select onChange={(event) => setSeverity(event.target.value as SeverityFilter)} value={severity}><option value="all">All levels</option><option value="critical">Critical</option><option value="warning">Warning</option></select></label>
          </div>
        </div>
        <div className="table-wrap"><table className="alerts-table"><thead><tr><th>Condition</th><th>Target</th><th>Value</th><th>Opened</th><th>State</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>
          {visible.map((alert) => <tr key={alert.alert_key}>
            <td><div className="alert-condition"><span className={`severity-mark ${alert.severity}`} /><div><strong>{alert.title}</strong><small>{alert.category} · {alert.severity} · {alert.acknowledged_at ? "acknowledged" : alert.status}</small></div></div></td>
            <td>{alert.target_id ? <a className="table-link" href={`/containers/${alert.target_id}`}>{alert.target_name ?? alert.target_id.slice(0, 12)}</a> : <span className="cell-primary">Host</span>}</td>
            <td><strong className="cell-primary">{alertValue(alert)}</strong>{alert.threshold !== null ? <span className="cell-secondary">threshold {alert.threshold}{alert.unit === "%" ? "%" : ""}</span> : null}</td>
            <td><span className="cell-primary">{timestamp(alert.opened_at)}</span><span className="cell-secondary">Updated {timestamp(alert.updated_at)}</span></td>
            <td>{alert.status === "resolved" ? <span className="state-label resolved"><Check size={13} />Resolved</span> : alert.acknowledged_at ? <span className="state-label acknowledged">Acknowledged</span> : <span className="state-label active">Active</span>}</td>
            <td className="alert-action-cell">{alert.status === "active" && !alert.acknowledged_at && canOperate ? <button className="secondary-command" disabled={acknowledging === alert.alert_key} onClick={() => void acknowledge(alert)} type="button"><Check size={14} />Acknowledge</button> : null}</td>
          </tr>)}
          {!visible.length ? <tr><td className="table-empty" colSpan={6}><Bell size={24} /><strong>{loading ? "Loading alerts" : "No matching alerts"}</strong><span>{loading ? "Reading retained alert states." : "Change the filters or wait for a new condition."}</span></td></tr> : null}
        </tbody></table></div>
      </WorkspacePanel>

      <WorkspacePanel action={<span className="heading-count">{audit.length} events</span>} className="audit-panel" eyebrow="Accountability" title="Recent audit activity">
        <div className="audit-list">{audit.slice(0, 12).map((event) => <div key={event.id}><span className={`audit-outcome ${event.outcome}`} /><div><strong>{event.action.replaceAll(".", " ")}</strong><small>{event.target_name ?? event.target_id ?? "System"}</small></div><div><span>{event.actor}</span><time dateTime={new Date(event.timestamp * 1000).toISOString()}>{timestamp(event.timestamp)}</time></div></div>)}{!audit.length ? <div className="audit-empty">No write operations have been recorded.</div> : null}</div>
      </WorkspacePanel>
    </InfrastructureShell>
  );
}
