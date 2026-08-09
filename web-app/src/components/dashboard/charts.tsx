"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryPoint } from "@/lib/telemetry";
import { formatRate } from "@/lib/telemetry";

type TrendChartProps = {
  data: HistoryPoint[];
  mode: "resources" | "network";
};

export function TrendChart({ data, mode }: TrendChartProps) {
  if (data.length < 2) {
    return (
      <div className="chart-waiting">
        <span className="pulse-dot" />
        Building live history
      </div>
    );
  }

  if (mode === "network") {
    return (
      <div className="chart-frame" aria-label="Live network throughput chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e8eaed" strokeDasharray="3 4" vertical={false} />
            <XAxis axisLine={false} dataKey="label" minTickGap={28} tick={{ fill: "#7a7f89", fontSize: 11 }} tickLine={false} />
            <YAxis
              axisLine={false}
              tick={{ fill: "#7a7f89", fontSize: 11 }}
              tickFormatter={(value: number) => formatRate(value)}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<ChartTooltip mode="network" />} />
            <Line dataKey="networkIn" dot={false} isAnimationActive={false} name="Inbound" stroke="#087f8c" strokeWidth={2} type="monotone" />
            <Line dataKey="networkOut" dot={false} isAnimationActive={false} name="Outbound" stroke="#d97706" strokeWidth={2} type="monotone" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="chart-frame" aria-label="Live CPU and memory utilization chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cpuFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#087f8c" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#087f8c" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="memoryFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7c5cfc" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#7c5cfc" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e8eaed" strokeDasharray="3 4" vertical={false} />
          <XAxis axisLine={false} dataKey="label" minTickGap={28} tick={{ fill: "#7a7f89", fontSize: 11 }} tickLine={false} />
          <YAxis axisLine={false} domain={[0, 100]} tick={{ fill: "#7a7f89", fontSize: 11 }} tickFormatter={(value) => `${value}%`} tickLine={false} width={42} />
          <Tooltip content={<ChartTooltip mode="resources" />} />
          <Area dataKey="cpu" fill="url(#cpuFill)" isAnimationActive={false} name="CPU" stroke="#087f8c" strokeWidth={2} type="monotone" />
          <Area dataKey="memory" fill="url(#memoryFill)" isAnimationActive={false} name="Memory" stroke="#7c5cfc" strokeWidth={2} type="monotone" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({ active, label, payload, mode }: { active?: boolean; label?: string; payload?: Array<{ color: string; name: string; value: number }>; mode: TrendChartProps["mode"] }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <p>{label}</p>
      {payload.map((item) => (
        <div key={item.name}>
          <span style={{ background: item.color }} />
          {item.name}
          <strong>{mode === "network" ? formatRate(item.value) : `${item.value.toFixed(1)}%`}</strong>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ data, dataKey, color }: { data: HistoryPoint[]; dataKey: "cpu" | "memory"; color: string }) {
  const emptyPoint: HistoryPoint = {
    timestamp: 0,
    label: "",
    cpu: 0,
    memory: 0,
    networkIn: 0,
    networkOut: 0,
  };
  const chartData = data.length > 1 ? data : [emptyPoint, emptyPoint];

  return (
    <div className="sparkline" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line dataKey={dataKey} dot={false} isAnimationActive={false} stroke={color} strokeWidth={2} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
