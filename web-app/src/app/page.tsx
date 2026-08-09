"use client";

import {
  Activity,
  AlertCircle,
  Box,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type ResourceUsage = {
  total: number;
  used: number;
  free?: number;
  available?: number;
  percent: number;
};

type NetworkCounters = {
  bytes_sent: number;
  bytes_recv: number;
  packets_sent: number;
  packets_recv: number;
};

type Container = {
  id: string;
  name: string;
  image: string;
  image_tags: string[];
  status: string;
  started_at: string;
  restart_count: number;
  ports: Record<string, unknown>;
  labels: Record<string, string>;
  networks: string[];
  stats: {
    cpu_percent: number;
    memory_usage: number;
    memory_limit: number;
    memory_percent: number;
    network: { rx_bytes: number; tx_bytes: number };
    block_io: { read_bytes: number; write_bytes: number };
    pids: number;
  };
};

type Stats = {
  collected_at: string;
  vps: {
    hostname: string;
    fqdn: string;
    platform: string;
    system: string;
    release: string;
    kernel: string;
    architecture: string;
    uptime_seconds: number;
    cpu: {
      physical_cores: number | null;
      logical_cores: number | null;
      percent: number;
      per_cpu_percent: number[];
      load_average: { "1m": number; "5m": number; "15m": number };
    };
    memory: ResourceUsage;
    swap: ResourceUsage;
    disks: Array<ResourceUsage & { device: string; mountpoint: string; fstype: string }>;
    network: Record<string, NetworkCounters>;
  };
  docker: {
    available: boolean;
    error: string | null;
    version: null | {
      version: string;
      api_version: string;
      os: string;
      arch: string;
    };
    info: Record<string, string | number | null>;
    summary: {
      containers_total: number;
      containers_running: number;
      containers_stopped: number;
      images: number;
    };
    containers: Container[];
  };
};

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

function getApiBaseUrl() {
  if (configuredApiBaseUrl && configuredApiBaseUrl !== "auto") return configuredApiBaseUrl;
  if (typeof window === "undefined") return "/api";
  return `${window.location.protocol}//${window.location.hostname}:8080/api`;
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function formatNumber(value?: number | null) {
  return typeof value === "number" ? value.toLocaleString() : "0";
}

function statusTone(value: number) {
  if (value >= 85) return "danger";
  if (value >= 70) return "warning";
  return "ok";
}

function Meter({ value, tone = "ok" }: { value: number; tone?: "ok" | "warning" | "danger" }) {
  const boundedValue = Math.max(0, Math.min(100, value));

  return (
    <div className="meter" aria-label={`${boundedValue}%`}>
      <span className={tone} style={{ width: `${boundedValue}%` }} />
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  detail,
  percent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  percent?: number;
}) {
  return (
    <article className="stat-tile">
      <div className="tile-heading">
        <div className="tile-icon">{icon}</div>
        {typeof percent === "number" ? <span className={`health-dot ${statusTone(percent)}`} /> : null}
      </div>
      <p className="tile-label">{label}</p>
      <strong className="tile-value">{value}</strong>
      {detail ? <span className="tile-detail">{detail}</span> : null}
      {typeof percent === "number" ? <Meter value={percent} tone={statusTone(percent)} /> : null}
    </article>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {action ? <div className="panel-action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const response = await fetch(`${getApiBaseUrl()}/stats`, { cache: "no-store" });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setStats(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void loadStats();
    }, 0);
    const timer = window.setInterval(() => {
      void loadStats();
    }, 5000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadStats]);

  const containers = useMemo(() => stats?.docker.containers ?? [], [stats]);
  const runningContainers = containers.filter((container) => container.status === "running");
  const busiestContainers = useMemo(
    () => [...containers].sort((a, b) => b.stats.cpu_percent - a.stats.cpu_percent),
    [containers],
  );
  const totalNetwork = useMemo(() => {
    return Object.values(stats?.vps.network ?? {}).reduce(
      (total, item) => ({
        in: total.in + item.bytes_recv,
        out: total.out + item.bytes_sent,
      }),
      { in: 0, out: 0 },
    );
  }, [stats]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <TerminalSquare size={24} />
          </div>
          <div>
            <p className="kicker">A3S Labs Stat</p>
            <h1>Infrastructure console</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className={`status-chip ${error ? "danger" : "ok"}`}>
            {error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            {error ? "API degraded" : "Live telemetry"}
          </span>
          <button className="icon-button" onClick={loadStats} title="Refresh stats" type="button">
            <RefreshCw className={refreshing ? "spin" : undefined} size={18} />
          </button>
        </div>
      </header>

      {error ? <div className="alert">Backend unavailable: {error}</div> : null}
      {loading ? <div className="loading">Loading host metrics...</div> : null}

      {stats ? (
        <>
          <section className="host-band">
            <div>
              <p className="kicker">Host</p>
              <h2>{stats.vps.hostname}</h2>
              <p>{stats.vps.platform}</p>
            </div>
            <div className="host-facts">
              <span>
                <Clock3 size={15} /> {formatUptime(stats.vps.uptime_seconds)}
              </span>
              <span>
                <ShieldCheck size={15} /> {stats.vps.architecture}
              </span>
              <span>
                <Box size={15} /> {stats.docker.summary.containers_running} running
              </span>
            </div>
          </section>

          <section className="stat-grid">
            <StatTile
              icon={<Cpu size={22} />}
              label="CPU usage"
              value={`${stats.vps.cpu.percent}%`}
              detail={`${stats.vps.cpu.logical_cores ?? 0} threads, load ${stats.vps.cpu.load_average["1m"].toFixed(2)}`}
              percent={stats.vps.cpu.percent}
            />
            <StatTile
              icon={<MemoryStick size={22} />}
              label="Memory"
              value={formatBytes(stats.vps.memory.used)}
              detail={`${stats.vps.memory.percent}% of ${formatBytes(stats.vps.memory.total)}`}
              percent={stats.vps.memory.percent}
            />
            <StatTile
              icon={<HardDrive size={22} />}
              label="Primary disk"
              value={`${stats.vps.disks[0]?.percent ?? 0}%`}
              detail={
                stats.vps.disks[0]
                  ? `${formatBytes(stats.vps.disks[0].used)} of ${formatBytes(stats.vps.disks[0].total)}`
                  : "No disk data"
              }
              percent={stats.vps.disks[0]?.percent ?? 0}
            />
            <StatTile
              icon={<Network size={22} />}
              label="Network I/O"
              value={`${formatBytes(totalNetwork.in)} in`}
              detail={`${formatBytes(totalNetwork.out)} out across interfaces`}
            />
          </section>

          <section className="dashboard-grid">
            <Panel title="Resource pressure" action={<span>{new Date(stats.collected_at).toLocaleTimeString()}</span>}>
              <div className="pressure-stack">
                <div className="pressure-item">
                  <div className="metric-row">
                    <span>CPU</span>
                    <strong>{stats.vps.cpu.percent}%</strong>
                  </div>
                  <Meter value={stats.vps.cpu.percent} tone={statusTone(stats.vps.cpu.percent)} />
                </div>
                <div className="pressure-item">
                  <div className="metric-row">
                    <span>Memory</span>
                    <strong>{stats.vps.memory.percent}%</strong>
                  </div>
                  <Meter value={stats.vps.memory.percent} tone={statusTone(stats.vps.memory.percent)} />
                </div>
                <div className="pressure-item">
                  <div className="metric-row">
                    <span>Swap</span>
                    <strong>{stats.vps.swap.percent}%</strong>
                  </div>
                  <Meter value={stats.vps.swap.percent} tone={statusTone(stats.vps.swap.percent)} />
                </div>
              </div>
            </Panel>

            <Panel title="Docker engine" action={<span>{stats.docker.version?.version ?? "Unavailable"}</span>}>
              <div className="docker-summary">
                <div>
                  <strong>{formatNumber(stats.docker.summary.containers_total)}</strong>
                  <span>Total</span>
                </div>
                <div>
                  <strong>{formatNumber(stats.docker.summary.containers_running)}</strong>
                  <span>Running</span>
                </div>
                <div>
                  <strong>{formatNumber(stats.docker.summary.images)}</strong>
                  <span>Images</span>
                </div>
              </div>
              <dl className="info-list">
                <div>
                  <dt>OS</dt>
                  <dd>{stats.docker.info.operating_system ?? "N/A"}</dd>
                </div>
                <div>
                  <dt>Storage</dt>
                  <dd>{stats.docker.info.storage_driver ?? "N/A"}</dd>
                </div>
                <div>
                  <dt>Cgroup</dt>
                  <dd>{stats.docker.info.cgroup_driver ?? "N/A"}</dd>
                </div>
                <div>
                  <dt>Root</dt>
                  <dd>{stats.docker.info.docker_root_dir ?? "N/A"}</dd>
                </div>
              </dl>
            </Panel>
          </section>

          <Panel title="Containers and apps" action={<span>{runningContainers.length} running</span>}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>CPU</th>
                    <th>Memory</th>
                    <th>Network</th>
                    <th>I/O</th>
                    <th>Restarts</th>
                  </tr>
                </thead>
                <tbody>
                  {busiestContainers.map((container) => (
                    <tr key={container.id}>
                      <td>
                        <div className="container-name">{container.name}</div>
                        <div className="muted truncate">{container.image_tags[0] || container.image}</div>
                      </td>
                      <td>
                        <span className={`pill ${container.status}`}>{container.status}</span>
                      </td>
                      <td>
                        <strong>{container.stats.cpu_percent}%</strong>
                        <Meter value={container.stats.cpu_percent} tone={statusTone(container.stats.cpu_percent)} />
                      </td>
                      <td>
                        <strong>{formatBytes(container.stats.memory_usage)}</strong>
                        <div className="muted">{container.stats.memory_percent}%</div>
                      </td>
                      <td className="inline-metric">
                        <Network size={14} /> {formatBytes(container.stats.network.rx_bytes)} /{" "}
                        {formatBytes(container.stats.network.tx_bytes)}
                      </td>
                      <td className="inline-metric">
                        <Database size={14} /> {formatBytes(container.stats.block_io.read_bytes)} /{" "}
                        {formatBytes(container.stats.block_io.write_bytes)}
                      </td>
                      <td>{container.restart_count}</td>
                    </tr>
                  ))}
                  {!busiestContainers.length ? (
                    <tr>
                      <td colSpan={7} className="empty">
                        No containers found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>

          <section className="dashboard-grid">
            <Panel title="Disk usage" action={<Gauge size={18} />}>
              <div className="stack">
                {stats.vps.disks.map((disk) => (
                  <div key={`${disk.device}-${disk.mountpoint}`} className="compact-metric">
                    <div className="metric-row">
                      <span>{disk.mountpoint}</span>
                      <strong>{disk.percent}%</strong>
                    </div>
                    <Meter value={disk.percent} tone={statusTone(disk.percent)} />
                    <p className="muted">
                      {formatBytes(disk.used)} of {formatBytes(disk.total)} on {disk.device}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Network interfaces" action={<Activity size={18} />}>
              <div className="stack">
                {Object.entries(stats.vps.network)
                  .slice(0, 6)
                  .map(([name, net]) => (
                    <div key={name} className="network-row">
                      <strong>{name}</strong>
                      <span>{formatBytes(net.bytes_recv)} in</span>
                      <span>{formatBytes(net.bytes_sent)} out</span>
                    </div>
                  ))}
              </div>
            </Panel>
          </section>
        </>
      ) : null}

      {!stats && !loading ? (
        <section className="empty-state">
          <Server size={28} />
          <h2>No telemetry available</h2>
          <p>Check the backend service and refresh the console.</p>
        </section>
      ) : null}
    </main>
  );
}
