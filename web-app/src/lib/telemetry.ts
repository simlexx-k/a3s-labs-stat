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
