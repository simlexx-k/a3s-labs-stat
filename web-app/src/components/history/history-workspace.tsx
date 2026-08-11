"use client";

import { Activity, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InfrastructureShell } from "@/components/layout/infrastructure-shell";
import { WorkspaceNotice, WorkspacePageHeader, WorkspacePanel, WorkspaceSummary } from "@/components/layout/workspace-ui";
import { IconButton } from "@/components/ui/icon-button";
import { accessFetch, isAccessSessionExpired } from "@/lib/access-client";
import { formatBytes, type MetricSample, type Stats } from "@/lib/telemetry";

type WindowKey = "1h" | "6h" | "24h" | "7d";
const windows: Record<WindowKey, number> = { "1h": 3_600, "6h": 21_600, "24h": 86_400, "7d": 604_800 };

export function HistoryWorkspace() {
  const [windowKey, setWindowKey] = useState<WindowKey>("24h");
  const [samples, setSamples] = useState<MetricSample[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const since = Math.floor(Date.now() / 1000) - windows[windowKey];
      const [historyResponse, statsResponse] = await Promise.all([
        accessFetch(`/api/history?since=${since}&limit=10000`, { cache: "no-store" }),
        accessFetch("/api/stats", { cache: "no-store" }),
      ]);
      if (!historyResponse.ok || !statsResponse.ok) throw new Error("Historical telemetry unavailable");
      const history = await historyResponse.json() as { samples: MetricSample[] };
      setSamples(history.samples);
      setStats(await statsResponse.json() as Stats);
      setError(null);
    } catch (reason) {
      if (isAccessSessionExpired(reason)) return;
      setError(reason instanceof Error ? reason.message : "Historical telemetry unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [windowKey]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 15_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  const chartData = useMemo(() => samples.map((sample) => ({
    ...sample,
    label: new Date(sample.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  })), [samples]);
  const peakCpu = Math.max(...samples.map((sample) => sample.cpu_percent), 0);
  const peakMemory = Math.max(...samples.map((sample) => sample.memory_percent), 0);
  const latest = samples.at(-1);

  const exportCsv = () => {
    const lines = [
      "timestamp,cpu_percent,memory_percent,disk_percent,network_rx_bytes,network_tx_bytes,containers_running,containers_total",
      ...samples.map((sample) => [sample.collected_at, sample.cpu_percent, sample.memory_percent, sample.disk_percent, sample.network_rx_bytes, sample.network_tx_bytes, sample.containers_running, sample.containers_total].join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `istatus-history-${windowKey}-${new Date().toISOString().replaceAll(":", "-")}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <InfrastructureShell
      activeView="history"
      connectionLabel={error ? "History interrupted" : samples.length ? "History available" : "Collecting history"}
      connectionTone={error ? "error" : samples.length ? "live" : "pending"}
      containerCount={stats?.docker.summary.containers_total}
      hostname={stats?.vps.hostname}
      lastUpdated={latest ? new Date(latest.timestamp * 1000) : null}
      locationTitle="Telemetry history"
      topbarActions={<IconButton label="Refresh history" onClick={() => void load()} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : undefined} size={18} /></IconButton>}
    >
      <WorkspacePageHeader
        actions={<>
          <div className="segment-control" aria-label="History window" role="group">
            {(Object.keys(windows) as WindowKey[]).map((value) => <button aria-pressed={windowKey === value} key={value} onClick={() => setWindowKey(value)} type="button">{value}</button>)}
          </div>
          <IconButton label="Export history as CSV" onClick={exportCsv} disabled={!samples.length}><Download size={17} /></IconButton>
        </>}
        description="Persistent host and workload measurements retained by the telemetry service."
        eyebrow="Observability"
        title="Telemetry history"
      />

      {error ? <WorkspaceNotice icon={<Activity />} onAction={() => void load()} title="History unavailable" tone="danger">{error}</WorkspaceNotice> : null}

      <WorkspaceSummary ariaLabel="History summary" items={[
        { detail: "selected window", label: "Samples", value: samples.length.toLocaleString() },
        { detail: "host utilization", label: "Peak CPU", value: `${peakCpu.toFixed(1)}%` },
        { detail: "host utilization", label: "Peak memory", value: `${peakMemory.toFixed(1)}%` },
        { detail: "latest counters", label: "Network totals", value: formatBytes((latest?.network_rx_bytes ?? 0) + (latest?.network_tx_bytes ?? 0)) },
      ]} />

      <div className="history-grid">
        <WorkspacePanel action={<span className="heading-count">{windowKey}</span>} className="history-panel" eyebrow="Resources" title="CPU and memory">
          <div className="history-chart">
            {loading ? <div className="chart-waiting"><span className="pulse-dot" />Loading samples</div> : !chartData.length ? <div className="chart-waiting">Waiting for retained samples</div> : (
              <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 12, right: 20, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#e8eaed" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" minTickGap={42} tick={{ fontSize: 10, fill: "#717680" }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#717680" }} unit="%" />
                <Tooltip /><Legend /><Line dataKey="cpu_percent" dot={false} isAnimationActive={false} name="CPU" stroke="#087f8c" strokeWidth={2} type="monotone" /><Line dataKey="memory_percent" dot={false} isAnimationActive={false} name="Memory" stroke="#7868b4" strokeWidth={2} type="monotone" />
              </LineChart></ResponsiveContainer>
            )}
          </div>
        </WorkspacePanel>
        <WorkspacePanel action={<span className="heading-count">retained</span>} className="history-panel" eyebrow="Capacity" title="Disk and workloads">
          <div className="history-chart">
            {loading ? <div className="chart-waiting"><span className="pulse-dot" />Loading samples</div> : !chartData.length ? <div className="chart-waiting">Waiting for retained samples</div> : (
              <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 12, right: 20, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#e8eaed" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" minTickGap={42} tick={{ fontSize: 10, fill: "#717680" }} /><YAxis tick={{ fontSize: 10, fill: "#717680" }} />
                <Tooltip /><Legend /><Line dataKey="disk_percent" dot={false} isAnimationActive={false} name="Disk %" stroke="#b5771a" strokeWidth={2} type="monotone" /><Line dataKey="containers_running" dot={false} isAnimationActive={false} name="Running" stroke="#238f5b" strokeWidth={2} type="stepAfter" />
              </LineChart></ResponsiveContainer>
            )}
          </div>
        </WorkspacePanel>
      </div>
    </InfrastructureShell>
  );
}
