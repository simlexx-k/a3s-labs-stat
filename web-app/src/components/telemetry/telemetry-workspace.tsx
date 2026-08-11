"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Boxes,
  Clock3,
  Cpu,
  Database,
  HardDrive,
  Layers3,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sparkline, TrendChart } from "@/components/dashboard/charts";
import { ContainersTable } from "@/components/dashboard/containers-table";
import { InfrastructureShell } from "@/components/layout/infrastructure-shell";
import {
  WorkspaceEmptyState,
  WorkspaceNotice,
  WorkspacePageHeader,
  WorkspacePanel,
  WorkspaceStatus,
  WorkspaceSummary,
} from "@/components/layout/workspace-ui";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { accessFetch, isAccessSessionExpired } from "@/lib/access-client";
import {
  formatBytes,
  formatNumber,
  formatRate,
  formatUptime,
  healthTone,
  totalNetworkCounters,
  type HealthTone,
  type HistoryPoint,
  type Stats,
} from "@/lib/telemetry";

export type TelemetryView = "overview" | "containers" | "resources" | "storage" | "network";

const refreshOptions = [
  { label: "5 sec", value: 5000 },
  { label: "10 sec", value: 10000 },
  { label: "30 sec", value: 30000 },
  { label: "Paused", value: 0 },
];

const viewTitles: Record<TelemetryView, string> = {
  overview: "Host overview",
  containers: "Containers",
  resources: "Resources",
  storage: "Storage",
  network: "Network",
};

function Meter({ value, tone = healthTone(value) }: { value: number; tone?: HealthTone }) {
  const boundedValue = Math.max(0, Math.min(100, value));
  return <div className="meter" aria-label={`${boundedValue}% utilization`}><span className={tone} style={{ width: `${boundedValue}%` }} /></div>;
}

function MetricCard({ chart, detail, href, icon, label, percent, value }: {
  chart?: ReactNode;
  detail: string;
  href: string;
  icon: ReactNode;
  label: string;
  percent?: number;
  value: string;
}) {
  return (
    <a className="metric-card metric-card-link" href={href}>
      <div className="metric-card-top">
        <span className="metric-icon">{icon}</span>
        {typeof percent === "number"
          ? <span className={`metric-state ${healthTone(percent)}`}><i />{healthTone(percent) === "healthy" ? "Normal" : healthTone(percent)}</span>
          : <ArrowRight aria-hidden="true" className="metric-card-arrow" size={17} />}
      </div>
      <div className="metric-value-row"><strong>{value}</strong>{chart}</div>
      <p>{label}</p>
      <span>{detail}</span>
    </a>
  );
}

function LoadingWorkspace() {
  return (
    <div className="dashboard-skeleton" aria-label="Loading telemetry">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <div className="skeleton-cards"><span /><span /><span /><span /></div>
      <div className="skeleton-panels"><span /><span /></div>
    </div>
  );
}

export function TelemetryWorkspace({ view }: { view: TelemetryView }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestInFlight = useRef(false);
  const previousNetwork = useRef<{ received: number; sent: number; timestamp: number } | null>(null);

  const loadStats = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;

    try {
      setRefreshing(true);
      const response = await accessFetch("/api/stats", { cache: "no-store" });
      if (!response.ok) throw new Error("The telemetry service is not responding");

      const nextStats = (await response.json()) as Stats;
      const timestamp = Date.now();
      const totals = totalNetworkCounters(nextStats.vps.network);
      const previous = previousNetwork.current;
      const elapsedSeconds = previous ? Math.max((timestamp - previous.timestamp) / 1000, 1) : 1;
      const networkIn = previous ? Math.max(0, totals.received - previous.received) / elapsedSeconds : 0;
      const networkOut = previous ? Math.max(0, totals.sent - previous.sent) / elapsedSeconds : 0;

      previousNetwork.current = { ...totals, timestamp };
      setStats(nextStats);
      setLastUpdated(new Date(timestamp));
      setHistory((current) => [
        ...current,
        {
          timestamp,
          label: new Date(timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
          cpu: nextStats.vps.cpu.percent,
          memory: nextStats.vps.memory.percent,
          networkIn,
          networkOut,
        },
      ].slice(-24));
      setError(null);
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "Unable to reach the telemetry service");
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadStats(), 0);
    return () => window.clearTimeout(initial);
  }, [loadStats]);

  useEffect(() => {
    if (!refreshInterval) return;
    const timer = window.setInterval(() => void loadStats(), refreshInterval);
    return () => window.clearInterval(timer);
  }, [loadStats, refreshInterval]);

  const containers = useMemo(() => stats?.docker.containers ?? [], [stats]);
  const runningContainers = containers.filter((container) => container.status === "running");
  const primaryDisk = stats?.vps.disks[0];
  const latestHistory = history.at(-1);
  const networkTotals = stats ? totalNetworkCounters(stats.vps.network) : { received: 0, sent: 0 };
  const diskTotal = stats?.vps.disks.reduce((total, disk) => total + disk.total, 0) ?? 0;
  const diskUsed = stats?.vps.disks.reduce((total, disk) => total + disk.used, 0) ?? 0;
  const diskAvailable = stats?.vps.disks.reduce((total, disk) => total + (disk.available ?? disk.free ?? 0), 0) ?? 0;
  const highestDisk = stats?.vps.disks.reduce<(Stats["vps"]["disks"][number] | null)>((highest, disk) => !highest || disk.percent > highest.percent ? disk : highest, null);
  const resourceHealth = stats ? Math.max(stats.vps.cpu.percent, stats.vps.memory.percent, stats.vps.swap.percent) : 0;

  return (
    <InfrastructureShell
      activeView={view}
      connectionLabel={error ? "Connection lost" : stats ? "Telemetry live" : "Connecting"}
      connectionTone={error ? "error" : stats ? "live" : "pending"}
      containerCount={containers.length}
      hostname={stats?.vps.hostname}
      lastUpdated={lastUpdated}
      locationTitle={viewTitles[view]}
      topbarActions={(
        <>
          <label className="refresh-select">
            <span className="sr-only">Auto refresh interval</span>
            <select onChange={(event) => setRefreshInterval(Number(event.target.value))} value={refreshInterval}>
              {refreshOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <IconButton label="Refresh telemetry" onClick={() => void loadStats()} disabled={refreshing}>
            <RefreshCw className={refreshing ? "spin" : undefined} size={18} />
          </IconButton>
        </>
      )}
    >
      {error ? <WorkspaceNotice icon={<AlertTriangle />} onAction={() => void loadStats()} title={stats ? "Live updates interrupted" : "Telemetry unavailable"} tone={stats ? "warning" : "danger"}>{error}. {stats ? "Showing the most recent snapshot." : "Check the telemetry service and try again."}</WorkspaceNotice> : null}
      {loading ? <LoadingWorkspace /> : null}
      {stats && view === "overview" ? (
        <>
          <WorkspacePageHeader
            actions={<div className="host-meta"><span><Clock3 size={15} />Uptime <strong>{formatUptime(stats.vps.uptime_seconds)}</strong></span><span><Layers3 size={15} />Kernel <strong>{stats.vps.kernel}</strong></span><span><ShieldCheck size={15} />Arch <strong>{stats.vps.architecture}</strong></span></div>}
            description={stats.vps.platform}
            eyebrow="Infrastructure overview"
            status={<WorkspaceStatus tone={error ? "warning" : "success"}>{error ? "Snapshot" : "Live"}</WorkspaceStatus>}
            title={stats.vps.hostname}
          />
          <section className="metric-grid" aria-label="Infrastructure areas">
            <MetricCard chart={<Sparkline color="#087f8c" data={history} dataKey="cpu" />} detail={`${stats.vps.cpu.logical_cores ?? 0} logical cores · ${stats.vps.memory.percent.toFixed(1)}% memory`} href="/resources" icon={<Cpu size={19} />} label="Resources" percent={resourceHealth} value={`${stats.vps.cpu.percent.toFixed(1)}% CPU`} />
            <MetricCard detail={`${stats.docker.summary.images} images · ${stats.docker.summary.containers_stopped} stopped`} href="/containers" icon={<Boxes size={19} />} label="Containers" value={`${runningContainers.length} / ${containers.length} running`} />
            <MetricCard detail={primaryDisk ? `${formatBytes(primaryDisk.available ?? primaryDisk.free)} available on ${primaryDisk.mountpoint}` : "No filesystem mounted"} href="/storage" icon={<HardDrive size={19} />} label="Storage" percent={primaryDisk?.percent ?? 0} value={`${(primaryDisk?.percent ?? 0).toFixed(1)}% used`} />
            <MetricCard detail={`${Object.keys(stats.vps.network).length} interfaces · ${formatBytes(networkTotals.received)} received`} href="/network" icon={<Network size={19} />} label="Network" value={`${formatRate(latestHistory?.networkIn)} inbound`} />
          </section>
        </>
      ) : null}

      {stats && view === "containers" ? (
        <>
          <WorkspacePageHeader description={`Docker ${stats.docker.version?.version ?? "runtime"} on ${stats.vps.hostname}`} eyebrow="Workload inventory" status={<WorkspaceStatus tone={stats.docker.available ? "success" : "danger"}>{stats.docker.available ? "Engine online" : "Engine offline"}</WorkspaceStatus>} title="Containers" />
          <WorkspaceSummary ariaLabel="Container summary" items={[
            { detail: "known workloads", label: "Total", value: stats.docker.summary.containers_total },
            { detail: "currently active", label: "Running", tone: "success", value: stats.docker.summary.containers_running },
            { detail: "not running", label: "Stopped", tone: stats.docker.summary.containers_stopped ? "warning" : "default", value: stats.docker.summary.containers_stopped },
            { detail: "local images", label: "Images", value: stats.docker.summary.images },
          ]} />
          <ContainersTable containers={containers} />
          <WorkspacePanel className="runtime-panel" eyebrow="Docker runtime" title="Engine configuration" action={<span className={`runtime-state ${stats.docker.available ? "live" : "error"}`}><i />{stats.docker.available ? "Online" : "Offline"}</span>}>
            <div className="runtime-summary"><div><strong>{formatNumber(stats.docker.summary.containers_total)}</strong><span>Containers</span></div><div><strong>{formatNumber(stats.docker.summary.images)}</strong><span>Images</span></div><div><strong>{stats.docker.version?.version ?? "N/A"}</strong><span>Version</span></div></div>
            <dl className="runtime-details"><div><dt>Storage driver</dt><dd>{stats.docker.info.storage_driver ?? "N/A"}</dd></div><div><dt>Cgroup driver</dt><dd>{stats.docker.info.cgroup_driver ?? "N/A"}</dd></div><div><dt>Docker root</dt><dd className="mono">{stats.docker.info.docker_root_dir ?? "N/A"}</dd></div><div><dt>Operating system</dt><dd>{stats.docker.info.operating_system ?? "N/A"}</dd></div></dl>
          </WorkspacePanel>
        </>
      ) : null}

      {stats && view === "resources" ? (
        <>
          <WorkspacePageHeader description={`${stats.vps.cpu.logical_cores ?? 0} logical cores and ${formatBytes(stats.vps.memory.total)} system memory`} eyebrow="Host telemetry" status={<WorkspaceStatus tone={healthTone(resourceHealth) === "healthy" ? "success" : healthTone(resourceHealth) === "warning" ? "warning" : "danger"}>{healthTone(resourceHealth)}</WorkspaceStatus>} title="Resources" />
          <WorkspaceSummary ariaLabel="Resource summary" items={[
            { detail: `${stats.vps.cpu.logical_cores ?? 0} logical cores`, label: "CPU", tone: healthTone(stats.vps.cpu.percent) === "healthy" ? "default" : healthTone(stats.vps.cpu.percent) === "warning" ? "warning" : "danger", value: `${stats.vps.cpu.percent.toFixed(1)}%` },
            { detail: `${formatBytes(stats.vps.memory.used)} used`, label: "Memory", tone: healthTone(stats.vps.memory.percent) === "healthy" ? "default" : healthTone(stats.vps.memory.percent) === "warning" ? "warning" : "danger", value: `${stats.vps.memory.percent.toFixed(1)}%` },
            { detail: `${formatBytes(stats.vps.swap.used)} used`, label: "Swap", value: `${stats.vps.swap.percent.toFixed(1)}%` },
            { detail: "1 minute average", label: "Load", value: stats.vps.cpu.load_average["1m"].toFixed(2) },
          ]} />
          <section className="overview-grid">
            <WorkspacePanel className="trend-panel" eyebrow="Live session" title="CPU and memory utilization" action={<div className="chart-legend"><span className="cpu"><i />CPU</span><span className="memory"><i />Memory</span></div>}>
              <TrendChart data={history} mode="resources" />
              <div className="chart-summary"><span>Current CPU <strong>{stats.vps.cpu.percent.toFixed(1)}%</strong></span><span>Current memory <strong>{stats.vps.memory.percent.toFixed(1)}%</strong></span><span>1m load <strong>{stats.vps.cpu.load_average["1m"].toFixed(2)}</strong></span></div>
            </WorkspacePanel>
            <WorkspacePanel className="health-panel" eyebrow="Current snapshot" title="System pressure" action={<span className={`health-label ${healthTone(resourceHealth)}`}><i />{healthTone(resourceHealth)}</span>}>
              <div className="health-list"><div><div><span>CPU pressure</span><strong>{stats.vps.cpu.percent.toFixed(1)}%</strong></div><Meter value={stats.vps.cpu.percent} /></div><div><div><span>Memory pressure</span><strong>{stats.vps.memory.percent.toFixed(1)}%</strong></div><Meter value={stats.vps.memory.percent} /></div><div><div><span>Swap pressure</span><strong>{stats.vps.swap.percent.toFixed(1)}%</strong></div><Meter value={stats.vps.swap.percent} /></div></div>
              <div className="core-strip" aria-label="Per-core CPU utilization">{stats.vps.cpu.per_cpu_percent.slice(0, 24).map((value, index) => <span key={index} title={`Core ${index + 1}: ${value}%`}><i className={healthTone(value)} style={{ height: `${Math.max(value, 5)}%` }} /></span>)}</div>
              <div className="core-caption"><span>{stats.vps.cpu.per_cpu_percent.length} logical cores</span><span>Per-core activity</span></div>
            </WorkspacePanel>
          </section>
        </>
      ) : null}

      {stats && view === "storage" ? (
        <>
          <WorkspacePageHeader description={`Mounted filesystems on ${stats.vps.hostname}`} eyebrow="Capacity management" status={<WorkspaceStatus tone={highestDisk && healthTone(highestDisk.percent) !== "healthy" ? "warning" : "success"}>{highestDisk ? `${highestDisk.percent.toFixed(1)}% peak` : "No mounts"}</WorkspaceStatus>} title="Storage" />
          <WorkspaceSummary ariaLabel="Storage summary" items={[
            { detail: "mounted filesystems", label: "Mounts", value: stats.vps.disks.length },
            { detail: `of ${formatBytes(diskTotal)}`, label: "Used", value: formatBytes(diskUsed) },
            { detail: "available capacity", label: "Free", tone: "success", value: formatBytes(diskAvailable) },
            { detail: highestDisk?.mountpoint ?? "No filesystem", label: "Highest use", tone: highestDisk && healthTone(highestDisk.percent) !== "healthy" ? "warning" : "default", value: highestDisk ? `${highestDisk.percent.toFixed(1)}%` : "—" },
          ]} />
          <WorkspacePanel eyebrow="Filesystems" title="Mounted storage" action={<HardDrive size={18} />}>
            <div className="storage-list">{stats.vps.disks.map((disk) => <div className="storage-row" key={`${disk.device}-${disk.mountpoint}`}><div className="storage-icon"><Database size={17} /></div><div><div className="storage-title"><strong>{disk.mountpoint}</strong><span>{disk.percent.toFixed(1)}%</span></div><Meter value={disk.percent} /><p>{formatBytes(disk.used)} of {formatBytes(disk.total)} · {disk.fstype} · <span className="mono">{disk.device}</span></p></div></div>)}</div>
          </WorkspacePanel>
        </>
      ) : null}

      {stats && view === "network" ? (
        <>
          <WorkspacePageHeader description={`Host and bridge interfaces on ${stats.vps.hostname}`} eyebrow="Traffic telemetry" status={<WorkspaceStatus tone="success">{Object.keys(stats.vps.network).length} interfaces</WorkspaceStatus>} title="Network" />
          <WorkspaceSummary ariaLabel="Network summary" items={[
            { detail: "current rate", label: "Inbound", value: formatRate(latestHistory?.networkIn) },
            { detail: "current rate", label: "Outbound", value: formatRate(latestHistory?.networkOut) },
            { detail: "since host start", label: "Received", value: formatBytes(networkTotals.received) },
            { detail: "since host start", label: "Sent", value: formatBytes(networkTotals.sent) },
          ]} />
          <section className="overview-grid network-page-grid">
            <WorkspacePanel className="trend-panel" eyebrow="Live throughput" title="Network traffic" action={<div className="chart-legend"><span className="cpu"><i />In</span><span className="out"><i />Out</span></div>}>
              <div className="network-totals"><span><ArrowDown size={15} /><small>Inbound</small><strong>{formatRate(latestHistory?.networkIn)}</strong></span><span><ArrowUp size={15} /><small>Outbound</small><strong>{formatRate(latestHistory?.networkOut)}</strong></span></div>
              <TrendChart data={history} mode="network" />
            </WorkspacePanel>
            <WorkspacePanel eyebrow="Counters" title="Interfaces" action={<Network size={18} />}>
              <div className="network-interface-list">{Object.entries(stats.vps.network).map(([name, counters]) => <div key={name}><div><strong>{name}</strong><span>{formatNumber(counters.packets_recv + counters.packets_sent)} packets</span></div><dl><div><dt>Received</dt><dd>{formatBytes(counters.bytes_recv)}</dd></div><div><dt>Sent</dt><dd>{formatBytes(counters.bytes_sent)}</dd></div></dl></div>)}</div>
            </WorkspacePanel>
          </section>
        </>
      ) : null}

      {!stats && !loading ? <WorkspaceEmptyState action={<Button onClick={() => void loadStats()}><RefreshCw size={16} />Try again</Button>} description="Live metrics are temporarily unavailable. Check that the telemetry service is running and try again." icon={<Server size={22} />} title="Telemetry is offline" /> : null}
    </InfrastructureShell>
  );
}
