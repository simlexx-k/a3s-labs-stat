"use client";

import { Activity, Box, CirclePause, CirclePlay, Network, RefreshCw, RotateCw, Search, Square, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InfrastructureShell } from "@/components/layout/infrastructure-shell";
import { WorkspaceNotice, WorkspacePageHeader, WorkspacePanel, WorkspaceStatus, WorkspaceSummary } from "@/components/layout/workspace-ui";
import { IconButton } from "@/components/ui/icon-button";
import { accessFetch, isAccessSessionExpired, verifyAccessSession } from "@/lib/access-client";
import { formatBytes, type AccessSession, type ContainerDetail, type ContainerEvent, type ContainerMetricSample, type Stats } from "@/lib/telemetry";

type Tab = "overview" | "inspect" | "events";
type Action = "start" | "stop" | "restart" | "pause" | "unpause";

const actionLabels: Record<Action, string> = { start: "Start", stop: "Stop", restart: "Restart", pause: "Pause", unpause: "Resume" };

function dateTime(value: string | number | null | undefined) {
  if (!value) return "Not recorded";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function availableActions(status: string): Action[] {
  if (status === "running") return ["restart", "pause", "stop"];
  if (status === "paused") return ["unpause", "stop"];
  return ["start"];
}

function actionIcon(action: Action) {
  if (action === "start" || action === "unpause") return <CirclePlay size={15} />;
  if (action === "pause") return <CirclePause size={15} />;
  if (action === "stop") return <Square size={14} />;
  return <RotateCw size={15} />;
}

export function ContainerDetailWorkspace({ containerId }: { containerId: string }) {
  const [detail, setDetail] = useState<ContainerDetail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [session, setSession] = useState<AccessSession | null>(null);
  const [history, setHistory] = useState<ContainerMetricSample[]>([]);
  const [events, setEvents] = useState<ContainerEvent[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [eventSearch, setEventSearch] = useState("");
  const [eventAction, setEventAction] = useState("all");
  const [eventsConnected, setEventsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [actionRunning, setActionRunning] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const since = Math.floor(Date.now() / 1000) - 86_400;
      const eventSince = Math.floor(Date.now() / 1000) - 3_600;
      const [detailResponse, historyResponse, sessionResponse, statsResponse, eventsResponse] = await Promise.all([
        accessFetch(`/api/containers/${encodeURIComponent(containerId)}`, { cache: "no-store" }),
        accessFetch(`/api/containers/${encodeURIComponent(containerId)}/history?since=${since}`, { cache: "no-store" }),
        accessFetch("/api/session", { cache: "no-store" }),
        accessFetch("/api/stats", { cache: "no-store" }),
        accessFetch(`/api/containers/${encodeURIComponent(containerId)}/events?since=${eventSince}`, { cache: "no-store" }),
      ]);
      if (!detailResponse.ok || !historyResponse.ok || !sessionResponse.ok || !statsResponse.ok) throw new Error("Container details unavailable");
      setDetail(await detailResponse.json() as ContainerDetail);
      setHistory((await historyResponse.json() as { samples: ContainerMetricSample[] }).samples);
      setSession(await sessionResponse.json() as AccessSession);
      setStats(await statsResponse.json() as Stats);
      if (eventsResponse.ok) setEvents((await eventsResponse.json() as { events: ContainerEvent[] }).events.toReversed());
      setError(null);
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "Container details unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [containerId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  useEffect(() => {
    const source = new EventSource(`/api/containers/${encodeURIComponent(containerId)}/events/stream`);
    const ready = () => setEventsConnected(true);
    const incoming = (message: Event) => {
      try {
        const event = JSON.parse((message as MessageEvent<string>).data) as ContainerEvent;
        setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 500));
      } catch { /* Ignore malformed event frames. */ }
    };
    const interrupted = () => {
      setEventsConnected(false);
      void verifyAccessSession();
    };
    source.addEventListener("ready", ready);
    source.addEventListener("container-event", incoming);
    source.addEventListener("telemetry-error", interrupted);
    source.onerror = interrupted;
    return () => source.close();
  }, [containerId]);

  const container = detail?.container;
  const liveContainer = stats?.docker.containers.find((item) => item.full_id === containerId || item.id === containerId);
  const canOperate = session?.role === "operator" || session?.role === "admin";
  const chartData = history.map((sample) => ({ ...sample, label: new Date(sample.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
  const eventActions = useMemo(() => [...new Set(events.map((event) => event.action))].sort(), [events]);
  const visibleEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    return events.filter((event) => (eventAction === "all" || event.action === eventAction) && (!query || `${event.action} ${event.container_name} ${event.image ?? ""}`.toLowerCase().includes(query)));
  }, [eventAction, eventSearch, events]);

  const executeAction = async () => {
    if (!pendingAction) return;
    setActionRunning(true);
    try {
      const response = await accessFetch(`/api/containers/${encodeURIComponent(containerId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingAction }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Container action failed");
      setPendingAction(null);
      await load();
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "Container action failed");
    } finally {
      setActionRunning(false);
    }
  };

  return (
    <InfrastructureShell
      activeView="containers"
      connectionLabel={error ? "Container unavailable" : detail ? "Container connected" : "Loading container"}
      connectionTone={error ? "error" : detail ? "live" : "pending"}
      containerCount={stats?.docker.summary.containers_total}
      hostname={stats?.vps.hostname}
      lastUpdated={detail?.collected_at ? new Date(detail.collected_at) : null}
      locationTitle="Container details"
      topbarActions={<IconButton label="Refresh container" onClick={() => void load()} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : undefined} size={18} /></IconButton>}
    >
      <WorkspacePageHeader
        actions={<>
          <span className={`role-badge ${session?.role ?? "viewer"}`}>{session?.role ?? "viewer"}</span>
          {canOperate && container ? <div className="action-button-group">{availableActions(container.status).map((action) => <button className={action === "stop" ? "danger-command" : "secondary-command"} key={action} onClick={() => setPendingAction(action)} type="button">{actionIcon(action)}{actionLabels[action]}</button>)}</div> : null}
        </>}
        description={<span className="mono">{container?.image ?? (loading ? "Loading container metadata" : "Container metadata unavailable")}</span>}
        eyebrow="Container"
        leading={<span className="container-glyph large"><span /></span>}
        status={container ? <WorkspaceStatus tone={container.status === "running" ? "success" : container.status === "paused" ? "warning" : "neutral"}>{container.status}</WorkspaceStatus> : null}
        title={container?.name ?? containerId.slice(0, 12)}
      />

      {error ? <WorkspaceNotice icon={<TriangleAlert />} onAction={() => void load()} title="Container data interrupted" tone="danger">{error}</WorkspaceNotice> : null}

      <nav className="detail-tabs" aria-label="Container views">
        {(["overview", "inspect", "events"] as Tab[]).map((value) => <button aria-current={tab === value ? "page" : undefined} key={value} onClick={() => setTab(value)} type="button">{value}{value === "events" ? <span className={eventsConnected ? "live-dot" : "idle-dot"} /> : null}</button>)}
        <a href={`/logs?container=${containerId}`}>Logs</a>
      </nav>

      {tab === "overview" ? <>
        <WorkspaceSummary ariaLabel="Container summary" items={[
          { detail: "current utilization", label: "CPU", value: `${liveContainer?.stats.cpu_percent.toFixed(1) ?? "—"}%` },
          { detail: liveContainer ? `${liveContainer.stats.memory_percent.toFixed(1)}% of limit` : "current usage", label: "Memory", value: liveContainer ? formatBytes(liveContainer.stats.memory_usage) : "—" },
          { detail: "container PIDs", label: "Processes", value: liveContainer?.stats.pids ?? "—" },
          { detail: container?.health?.status ?? "no health check", label: "Restarts", tone: container?.restart_count ? "warning" : "default", value: container?.restart_count ?? "—" },
        ]} />
        <div className="container-overview-grid">
          <WorkspacePanel className="container-facts" eyebrow="Runtime" title="Container state"><dl>
            <div><dt>Container ID</dt><dd className="mono">{container?.full_id ?? "—"}</dd></div><div><dt>Created</dt><dd>{dateTime(container?.created)}</dd></div><div><dt>Started</dt><dd>{dateTime(container?.started_at)}</dd></div><div><dt>Exit code</dt><dd>{container?.exit_code ?? "—"}</dd></div><div><dt>Restart policy</dt><dd>{String(container?.restart_policy.Name ?? "none")}</dd></div><div><dt>Platform</dt><dd>{container?.platform ?? "—"}</dd></div>
          </dl></WorkspacePanel>
          <WorkspacePanel action={<span className="heading-count">{history.length} samples</span>} className="container-history-panel" eyebrow="Last 24 hours" title="Resource history"><div className="container-history-chart">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 12, right: 18, left: -14, bottom: 0 }}><CartesianGrid stroke="#e8eaed" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" minTickGap={36} tick={{ fontSize: 10, fill: "#717680" }} /><YAxis tick={{ fontSize: 10, fill: "#717680" }} unit="%" /><Tooltip /><Legend /><Line dataKey="cpu_percent" dot={false} isAnimationActive={false} name="CPU" stroke="#087f8c" strokeWidth={2} type="monotone" /><Line dataKey="memory_percent" dot={false} isAnimationActive={false} name="Memory" stroke="#7868b4" strokeWidth={2} type="monotone" /></LineChart></ResponsiveContainer> : <div className="chart-waiting">Waiting for retained samples</div>}</div></WorkspacePanel>
        </div>
        <div className="container-network-grid">
          <WorkspacePanel eyebrow="Connectivity" title="Networks and ports"><div className="detail-list">{container?.networks.map((network) => <div key={network.name}><Network size={16} /><div><strong>{network.name}</strong><small>{network.ip_address || "No IP assigned"}{network.gateway ? ` · gateway ${network.gateway}` : ""}</small></div></div>)}{!container?.networks.length ? <div className="detail-list-empty">No attached networks</div> : null}{container?.ports.map((port) => <div key={`${port.container_port}-${port.host_port}`}><Box size={16} /><div><strong>{port.container_port}</strong><small>{port.host_port ? `${port.host_ip}:${port.host_port}` : "Not published"}</small></div></div>)}</div></WorkspacePanel>
          <WorkspacePanel eyebrow="Storage" title="Mounts"><div className="mount-table">{container?.mounts.map((mount) => <div key={`${mount.source}-${mount.destination}`}><span className="state-label resolved">{mount.type}</span><div><strong>{mount.destination}</strong><small title={mount.source}>{mount.source}</small></div><span>{mount.rw ? "Read / write" : "Read only"}</span></div>)}{!container?.mounts.length ? <div className="detail-list-empty">No attached mounts</div> : null}</div></WorkspacePanel>
        </div>
      </> : null}

      {tab === "inspect" ? <div className="inspect-grid">
        <WorkspacePanel action={<span className="heading-count">sensitive values redacted</span>} className="inspect-section" eyebrow="Configuration" title="Environment"><dl className="key-value-list">{container?.environment.map((item) => <div key={item.key}><dt>{item.key}</dt><dd className="mono">{item.value}</dd></div>)}{!container?.environment.length ? <div className="detail-list-empty">No environment entries</div> : null}</dl></WorkspacePanel>
        <WorkspacePanel className="inspect-section" eyebrow="Metadata" title="Labels"><dl className="key-value-list">{Object.entries(container?.labels ?? {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="mono">{value}</dd></div>)}{!Object.keys(container?.labels ?? {}).length ? <div className="detail-list-empty">No labels</div> : null}</dl></WorkspacePanel>
        <WorkspacePanel className="inspect-section" eyebrow="Limits" title="Resource configuration"><dl className="key-value-list">{Object.entries(container?.resources ?? {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{value || "Not limited"}</dd></div>)}</dl></WorkspacePanel>
        <WorkspacePanel className="inspect-section" eyebrow="Process" title="Launch configuration"><dl className="key-value-list"><div><dt>Entrypoint</dt><dd className="mono">{container?.entrypoint.join(" ") || "Image default"}</dd></div><div><dt>Command</dt><dd className="mono">{container?.command.join(" ") || "Image default"}</dd></div><div><dt>Working directory</dt><dd>{container?.working_dir || "/"}</dd></div><div><dt>User</dt><dd>{container?.user || "Image default"}</dd></div></dl></WorkspacePanel>
      </div> : null}

      {tab === "events" ? <WorkspacePanel className="events-panel"><div className="table-toolbar"><label className="search-field"><Search size={16} /><span className="sr-only">Search events</span><input onChange={(event) => setEventSearch(event.target.value)} placeholder="Search events" type="search" value={eventSearch} /></label><div className="events-toolbar-state"><label className="compact-select"><span>Action</span><select onChange={(event) => setEventAction(event.target.value)} value={eventAction}><option value="all">All actions</option>{eventActions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label><span className={eventsConnected ? "stream-state connected" : "stream-state"}><i />{eventsConnected ? "Live" : "Reconnecting"}</span></div></div><div className="events-list">{visibleEvents.map((event) => <div key={event.id}><span className="event-icon"><Activity size={15} /></span><div><strong>{event.action}</strong><small>{event.image ?? event.container_name}</small></div><time dateTime={new Date(event.timestamp * 1000).toISOString()}>{dateTime(event.timestamp)}</time></div>)}{!visibleEvents.length ? <div className="events-empty"><Activity size={23} /><strong>No matching Docker events</strong><span>Events will appear here as container state changes occur.</span></div> : null}</div></WorkspacePanel> : null}

      {pendingAction ? <div className="dialog-scrim" role="presentation"><div aria-labelledby="action-dialog-title" aria-modal="true" className="confirm-dialog" role="dialog"><span className="dialog-icon"><TriangleAlert size={20} /></span><h2 id="action-dialog-title">{actionLabels[pendingAction]} {container?.name}</h2><p>This operation changes the running state of the container and will be recorded in the audit log.</p><div><button className="secondary-command" disabled={actionRunning} onClick={() => setPendingAction(null)} type="button">Cancel</button><button className={pendingAction === "stop" ? "danger-command" : "primary-command"} disabled={actionRunning} onClick={() => void executeAction()} type="button">{actionRunning ? "Applying…" : `${actionLabels[pendingAction]} container`}</button></div></div></div> : null}
    </InfrastructureShell>
  );
}
