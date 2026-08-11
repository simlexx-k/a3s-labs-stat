export type ResourceUsage = {
  total: number;
  used: number;
  free?: number;
  available?: number;
  percent: number;
};

export type NetworkCounters = {
  bytes_sent: number;
  bytes_recv: number;
  packets_sent: number;
  packets_recv: number;
};

export type Container = {
  id: string;
  full_id: string;
  name: string;
  image: string;
  image_tags: string[];
  status: string;
  health?: string | null;
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

export type AccessSession = {
  display_name: string;
  email: string;
  role: "viewer" | "operator" | "admin";
  role_source: "default" | "environment" | "managed";
  status: "active" | "suspended";
  title: string;
  expires_at: number | null;
  issued_at: number | null;
};

export type ContainerDetail = {
  collected_at: string;
  container: {
    id: string;
    full_id: string;
    name: string;
    image: string;
    status: string;
    created: string | null;
    started_at: string | null;
    finished_at: string | null;
    exit_code: number | null;
    error: string | null;
    restart_count: number;
    platform: string | null;
    driver: string | null;
    command: string[];
    entrypoint: string[];
    working_dir: string | null;
    user: string | null;
    hostname: string | null;
    restart_policy: Record<string, unknown>;
    resources: Record<string, string | number | null>;
    health: null | {
      status: string;
      failing_streak: number;
      recent_checks: Array<{
        started_at: string;
        finished_at: string;
        exit_code: number;
        output: string;
      }>;
    };
    ports: Array<{ container_port: string; host_ip: string | null; host_port: string | null }>;
    networks: Array<{
      name: string;
      network_id: string | null;
      endpoint_id: string | null;
      ip_address: string | null;
      gateway: string | null;
      mac_address: string | null;
      aliases: string[];
    }>;
    mounts: Array<{
      type: string;
      name: string | null;
      source: string;
      destination: string;
      driver: string | null;
      mode: string;
      rw: boolean;
      propagation: string;
    }>;
    labels: Record<string, string>;
    environment: Array<{ key: string; value: string }>;
  };
};

export type ContainerEvent = {
  id: string;
  timestamp: number;
  time_nano: number | null;
  action: string;
  container_id: string;
  container_name: string;
  image: string | null;
  attributes: Record<string, string>;
};

export type MetricSample = {
  timestamp: number;
  collected_at: string;
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  containers_running: number;
  containers_total: number;
};

export type ContainerMetricSample = {
  timestamp: number;
  name: string;
  status: string;
  health: string | null;
  cpu_percent: number;
  memory_percent: number;
  restart_count: number;
};

export type AlertState = {
  alert_key: string;
  title: string;
  category: string;
  severity: "warning" | "critical";
  status: "active" | "resolved";
  value: number | null;
  threshold: number | null;
  unit: string | null;
  target_id: string | null;
  target_name: string | null;
  opened_at: number | null;
  updated_at: number;
  resolved_at: number | null;
  acknowledged_at: number | null;
  acknowledged_by: string | null;
};

export type AlertsResponse = {
  summary: { active: number; critical: number; acknowledged: number };
  alerts: AlertState[];
};

export type AuditEvent = {
  id: number;
  timestamp: number;
  actor: string;
  action: string;
  target_id: string | null;
  target_name: string | null;
  outcome: string;
  detail: string | null;
};

export type ContainerLogEntry = {
  timestamp: string | null;
  stream: "stdout" | "stderr";
  message: string;
  truncated: boolean;
};

export type ContainerLogs = {
  collected_at: string;
  container: Pick<Container, "id" | "full_id" | "name" | "image" | "status">;
  query: { tail: number; since: number | null };
  entries: ContainerLogEntry[];
  summary: {
    lines: number;
    stdout_lines: number;
    stderr_lines: number;
    bytes: number;
    truncated: boolean;
  };
};

export type Stats = {
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

export type HistoryPoint = {
  timestamp: number;
  label: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
};

export type HealthTone = "healthy" | "warning" | "critical";

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatRate(bytes?: number | null) {
  return `${formatBytes(bytes)}/s`;
}

export function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export function formatNumber(value?: number | null) {
  return typeof value === "number" ? value.toLocaleString() : "0";
}

export function healthTone(value: number): HealthTone {
  if (value >= 85) return "critical";
  if (value >= 70) return "warning";
  return "healthy";
}

export function totalNetworkCounters(network: Record<string, NetworkCounters>) {
  return Object.values(network).reduce(
    (total, item) => ({
      received: total.received + item.bytes_recv,
      sent: total.sent + item.bytes_sent,
    }),
    { received: 0, sent: 0 },
  );
}
