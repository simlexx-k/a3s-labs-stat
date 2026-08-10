"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  Clock3,
  Cpu,
  Database,
  HardDrive,
  Layers3,
  MemoryStick,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ContainersTable } from "@/components/dashboard/containers-table";
import { Sparkline, TrendChart } from "@/components/dashboard/charts";
import { InfrastructureShell } from "@/components/layout/infrastructure-shell";
import { IconButton } from "@/components/ui/icon-button";
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

const refreshOptions = [
  { label: "5 sec", value: 5000 },
  { label: "10 sec", value: 10000 },
  { label: "30 sec", value: 30000 },
  { label: "Paused", value: 0 },
];

function Meter({ value, tone = healthTone(value) }: { value: number; tone?: HealthTone }) {
  const boundedValue = Math.max(0, Math.min(100, value));
  return (
    <div className="meter" aria-label={`${boundedValue}% utilization`}>
      <span className={tone} style={{ width: `${boundedValue}%` }} />
    </div>
  );
}

function Panel({ title, eyebrow, action, children, className = "", id }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`panel ${className}`} id={id}>
      <div className="panel-heading">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? <div className="panel-action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ icon, label, value, detail, percent, chart }: { icon: ReactNode; label: string; value: string; detail: string; percent?: number; chart?: ReactNode }) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span className="metric-icon">{icon}</span>
        {typeof percent === "number" ? <span className={`metric-state ${healthTone(percent)}`}><i />{healthTone(percent) === "healthy" ? "Normal" : healthTone(percent)}</span> : null}
      </div>
      <div className="metric-value-row">
        <strong>{value}</strong>
        {chart}
      </div>
      <p>{label}</p>
      <span>{detail}</span>
    </article>
  );
}

function LoadingDashboard() {
  return (
    <div className="dashboard-skeleton" aria-label="Loading telemetry">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <div className="skeleton-cards"><span /><span /><span /><span /></div>
      <div className="skeleton-panels"><span /><span /></div>
    </div>
  );
}

export default function Dashboard() {
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
      const response = await fetch("/api/stats", { cache: "no-store" });
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the telemetry service");
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
  const overallHealth = stats
    ? Math.max(stats.vps.cpu.percent, stats.vps.memory.percent, primaryDisk?.percent ?? 0)
    : 0;

  return (
    <InfrastructureShell
      activeView="overview"
      connectionLabel={error ? "Connection lost" : stats ? "Telemetry live" : "Connecting"}
      connectionTone={error ? "error" : stats ? "live" : "pending"}
      containerCount={containers.length}
      hostname={stats?.vps.hostname}
      lastUpdated={lastUpdated}
      locationTitle={stats?.vps.hostname ?? "Host overview"}
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
          {error ? (
            <div className={`status-banner ${stats ? "warning" : "error"}`} role="alert">
              <AlertTriangle size={18} />
              <div><strong>{stats ? "Live updates interrupted" : "Telemetry unavailable"}</strong><span>{error}. {stats ? "Showing the most recent snapshot." : "Check the telemetry service and try again."}</span></div>
              <button onClick={() => void loadStats()} type="button">Retry</button>
            </div>
          ) : null}

          {loading ? <LoadingDashboard /> : null}

          {stats ? (
            <>
              <header className="page-heading" id="overview">
                <div>
                  <div className="heading-status"><span className={`connection-dot ${error ? "error" : "live"}`} />{error ? "Snapshot" : "Live"}</div>
                  <h1>{stats.vps.hostname}</h1>
                  <p>{stats.vps.platform}</p>
                </div>
                <div className="host-meta">
                  <span><Clock3 size={15} />Uptime <strong>{formatUptime(stats.vps.uptime_seconds)}</strong></span>
                  <span><Layers3 size={15} />Kernel <strong>{stats.vps.kernel}</strong></span>
                  <span><ShieldCheck size={15} />Arch <strong>{stats.vps.architecture}</strong></span>
                </div>
              </header>

              <section className="metric-grid" aria-label="Host metrics">
                <MetricCard icon={<Cpu size={19} />} label="CPU utilization" value={`${stats.vps.cpu.percent.toFixed(1)}%`} detail={`${stats.vps.cpu.logical_cores ?? 0} logical cores · load ${stats.vps.cpu.load_average["1m"].toFixed(2)}`} percent={stats.vps.cpu.percent} chart={<Sparkline color="#087f8c" data={history} dataKey="cpu" />} />
                <MetricCard icon={<MemoryStick size={19} />} label="Memory in use" value={formatBytes(stats.vps.memory.used)} detail={`${stats.vps.memory.percent.toFixed(1)}% of ${formatBytes(stats.vps.memory.total)}`} percent={stats.vps.memory.percent} chart={<Sparkline color="#7c5cfc" data={history} dataKey="memory" />} />
                <MetricCard icon={<HardDrive size={19} />} label="Primary disk" value={`${(primaryDisk?.percent ?? 0).toFixed(1)}%`} detail={primaryDisk ? `${formatBytes(primaryDisk.available ?? primaryDisk.free)} available on ${primaryDisk.mountpoint}` : "No disk mounted"} percent={primaryDisk?.percent ?? 0} />
                <MetricCard icon={<Boxes size={19} />} label="Running containers" value={`${runningContainers.length} / ${containers.length}`} detail={`${stats.docker.summary.images} images · ${stats.docker.summary.containers_stopped} stopped`} />
              </section>

              <section className="overview-grid" id="resources">
                <Panel
                  className="trend-panel"
                  eyebrow="Last two minutes"
                  title="Resource utilization"
                  action={<div className="chart-legend"><span className="cpu"><i />CPU</span><span className="memory"><i />Memory</span></div>}
                >
                  <TrendChart data={history} mode="resources" />
                  <div className="chart-summary">
                    <span>Current CPU <strong>{stats.vps.cpu.percent.toFixed(1)}%</strong></span>
                    <span>Current memory <strong>{stats.vps.memory.percent.toFixed(1)}%</strong></span>
                    <span>1m load <strong>{stats.vps.cpu.load_average["1m"].toFixed(2)}</strong></span>
                  </div>
                </Panel>

                <Panel className="health-panel" eyebrow="Current snapshot" title="System health" action={<span className={`health-label ${healthTone(overallHealth)}`}><i />{healthTone(overallHealth)}</span>}>
                  <div className="health-list">
                    <div><div><span>CPU pressure</span><strong>{stats.vps.cpu.percent.toFixed(1)}%</strong></div><Meter value={stats.vps.cpu.percent} /></div>
                    <div><div><span>Memory pressure</span><strong>{stats.vps.memory.percent.toFixed(1)}%</strong></div><Meter value={stats.vps.memory.percent} /></div>
                    <div><div><span>Swap pressure</span><strong>{stats.vps.swap.percent.toFixed(1)}%</strong></div><Meter value={stats.vps.swap.percent} /></div>
                    <div><div><span>Disk capacity</span><strong>{(primaryDisk?.percent ?? 0).toFixed(1)}%</strong></div><Meter value={primaryDisk?.percent ?? 0} /></div>
                  </div>
                  <div className="core-strip" aria-label="Per-core CPU utilization">
                    {stats.vps.cpu.per_cpu_percent.slice(0, 24).map((value, index) => <span key={index} title={`Core ${index + 1}: ${value}%`}><i className={healthTone(value)} style={{ height: `${Math.max(value, 5)}%` }} /></span>)}
                  </div>
                  <div className="core-caption"><span>{stats.vps.cpu.per_cpu_percent.length} logical cores</span><span>Per-core activity</span></div>
                </Panel>
              </section>

              <ContainersTable containers={containers} />

              <section className="system-grid">
                <Panel eyebrow="Filesystems" title="Storage" id="storage" action={<HardDrive size={18} />}>
                  <div className="storage-list">
                    {stats.vps.disks.map((disk) => (
                      <div className="storage-row" key={`${disk.device}-${disk.mountpoint}`}>
                        <div className="storage-icon"><Database size={17} /></div>
                        <div><div className="storage-title"><strong>{disk.mountpoint}</strong><span>{disk.percent.toFixed(1)}%</span></div><Meter value={disk.percent} /><p>{formatBytes(disk.used)} of {formatBytes(disk.total)} · {disk.fstype}</p></div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel eyebrow="Live throughput" title="Network" id="network" action={<div className="chart-legend"><span className="cpu"><i />In</span><span className="out"><i />Out</span></div>}>
                  <div className="network-totals">
                    <span><ArrowDown size={15} /><small>Inbound</small><strong>{formatRate(latestHistory?.networkIn)}</strong></span>
                    <span><ArrowUp size={15} /><small>Outbound</small><strong>{formatRate(latestHistory?.networkOut)}</strong></span>
                  </div>
                  <TrendChart data={history} mode="network" />
                </Panel>

                <Panel eyebrow="Docker runtime" title="Engine" action={<span className={`runtime-state ${stats.docker.available ? "live" : "error"}`}><i />{stats.docker.available ? "Online" : "Offline"}</span>}>
                  <div className="runtime-summary">
                    <div><strong>{formatNumber(stats.docker.summary.containers_total)}</strong><span>Containers</span></div>
                    <div><strong>{formatNumber(stats.docker.summary.images)}</strong><span>Images</span></div>
                    <div><strong>{stats.docker.version?.version ?? "N/A"}</strong><span>Version</span></div>
                  </div>
                  <dl className="runtime-details">
                    <div><dt>Storage driver</dt><dd>{stats.docker.info.storage_driver ?? "N/A"}</dd></div>
                    <div><dt>Cgroup driver</dt><dd>{stats.docker.info.cgroup_driver ?? "N/A"}</dd></div>
                    <div><dt>Docker root</dt><dd className="mono">{stats.docker.info.docker_root_dir ?? "N/A"}</dd></div>
                    <div><dt>Operating system</dt><dd>{stats.docker.info.operating_system ?? "N/A"}</dd></div>
                  </dl>
                </Panel>
              </section>
            </>
          ) : null}

          {!stats && !loading ? (
            <section className="connection-empty">
              <div className="empty-icon"><Server size={26} /></div>
              <p className="eyebrow">Connection required</p>
              <h1>Telemetry is offline</h1>
              <p>Live metrics are temporarily unavailable. Check that the telemetry service is running and try again.</p>
              <button onClick={() => void loadStats()} type="button"><RefreshCw size={16} />Try again</button>
            </section>
          ) : null}
    </InfrastructureShell>
  );
}
