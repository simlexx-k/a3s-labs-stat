"use client";

import {
  Activity,
  Box,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {detail ? <p className="stat-detail">{detail}</p> : null}
      </div>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="meter" aria-label={`${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    try {
      setError(null);
      const response = await fetch(`${getApiBaseUrl()}/stats`, { cache: "no-store" });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setStats(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load stats");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
    const timer = window.setInterval(loadStats, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const busiestContainers = useMemo(() => {
    return [...(stats?.docker.containers || [])].sort((a, b) => b.stats.cpu_percent - a.stats.cpu_percent);
  }, [stats]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">A3S Labs Stat</p>
          <h1>VPS and container telemetry</h1>
        </div>
        <button className="icon-button" onClick={loadStats} title="Refresh stats" type="button">
          <RefreshCw size={18} />
        </button>
      </header>

      {error ? <div className="alert">Backend unavailable: {error}</div> : null}
      {loading ? <div className="loading">Loading live host metrics...</div> : null}

      {stats ? (
        <>
          <section className="grid stats-grid">
            <StatCard icon={<Server size={22} />} label="Host" value={stats.vps.hostname} detail={stats.vps.platform} />
            <StatCard
              icon={<Cpu size={22} />}
              label="CPU"
              value={`${stats.vps.cpu.percent}%`}
              detail={`${stats.vps.cpu.logical_cores ?? 0} threads, load ${stats.vps.cpu.load_average["1m"].toFixed(2)}`}
            />
            <StatCard
              icon={<MemoryStick size={22} />}
              label="Memory"
              value={formatBytes(stats.vps.memory.used)}
              detail={`${stats.vps.memory.percent}% of ${formatBytes(stats.vps.memory.total)}`}
            />
            <StatCard
              icon={<Box size={22} />}
              label="Docker"
              value={stats.docker.available ? `${stats.docker.summary.containers_running} running` : "Offline"}
              detail={stats.docker.available ? `${stats.docker.summary.containers_total} containers, ${stats.docker.summary.images} images` : stats.docker.error || ""}
            />
          </section>

          <section className="panel-grid">
            <div className="panel">
              <div className="panel-heading">
                <h2>VPS</h2>
                <span>{formatUptime(stats.vps.uptime_seconds)} uptime</span>
              </div>
              <div className="metric-row">
                <span>CPU usage</span>
                <strong>{stats.vps.cpu.percent}%</strong>
              </div>
              <Meter value={stats.vps.cpu.percent} />
              <div className="metric-row">
                <span>Memory usage</span>
                <strong>{stats.vps.memory.percent}%</strong>
              </div>
              <Meter value={stats.vps.memory.percent} />
              <div className="metric-row">
                <span>Swap usage</span>
                <strong>{stats.vps.swap.percent}%</strong>
              </div>
              <Meter value={stats.vps.swap.percent} />
            </div>

            <div className="panel">
              <div className="panel-heading">
                <h2>Docker Engine</h2>
                <span>{stats.docker.version?.version || "Unavailable"}</span>
              </div>
              <dl className="info-list">
                <div><dt>OS</dt><dd>{stats.docker.info.operating_system || "N/A"}</dd></div>
                <div><dt>Storage</dt><dd>{stats.docker.info.storage_driver || "N/A"}</dd></div>
                <div><dt>Cgroup</dt><dd>{stats.docker.info.cgroup_driver || "N/A"}</dd></div>
                <div><dt>Root</dt><dd>{stats.docker.info.docker_root_dir || "N/A"}</dd></div>
              </dl>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Running containers and apps</h2>
              <span>Updated {new Date(stats.collected_at).toLocaleTimeString()}</span>
            </div>
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
                        <div className="muted">{container.image_tags[0] || container.image.slice(0, 18)}</div>
                      </td>
                      <td><span className={`pill ${container.status}`}>{container.status}</span></td>
                      <td>{container.stats.cpu_percent}%</td>
                      <td>
                        {formatBytes(container.stats.memory_usage)}
                        <div className="muted">{container.stats.memory_percent}%</div>
                      </td>
                      <td>
                        <Network size={14} /> {formatBytes(container.stats.network.rx_bytes)} / {formatBytes(container.stats.network.tx_bytes)}
                      </td>
                      <td>
                        <Database size={14} /> {formatBytes(container.stats.block_io.read_bytes)} / {formatBytes(container.stats.block_io.write_bytes)}
                      </td>
                      <td>{container.restart_count}</td>
                    </tr>
                  ))}
                  {!busiestContainers.length ? (
                    <tr>
                      <td colSpan={7} className="empty">No containers found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel-grid">
            <div className="panel">
              <div className="panel-heading">
                <h2>Disks</h2>
                <HardDrive size={18} />
              </div>
              <div className="stack">
                {stats.vps.disks.map((disk) => (
                  <div key={`${disk.device}-${disk.mountpoint}`} className="compact-metric">
                    <div className="metric-row">
                      <span>{disk.mountpoint}</span>
                      <strong>{disk.percent}%</strong>
                    </div>
                    <Meter value={disk.percent} />
                    <p className="muted">{formatBytes(disk.used)} of {formatBytes(disk.total)} on {disk.device}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <h2>Network</h2>
                <Activity size={18} />
              </div>
              <div className="stack">
                {Object.entries(stats.vps.network).slice(0, 6).map(([name, net]) => (
                  <div key={name} className="network-row">
                    <strong>{name}</strong>
                    <span>{formatBytes(net.bytes_recv)} in</span>
                    <span>{formatBytes(net.bytes_sent)} out</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

