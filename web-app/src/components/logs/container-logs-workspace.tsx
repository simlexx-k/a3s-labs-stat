"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronsDown,
  Clipboard,
  Download,
  Eraser,
  LogOut,
  RefreshCw,
  Search,
  SquareTerminal,
  WrapText,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconButton, IconLink } from "@/components/ui/icon-button";
import { formatBytes, type ContainerLogEntry, type ContainerLogs } from "@/lib/telemetry";

type StreamFilter = "all" | "stdout" | "stderr";
type Severity = "error" | "warning" | "info" | "debug" | "other";
type SeverityFilter = "all" | Severity;
type TimeRange = "all" | "15m" | "1h" | "6h" | "24h";
type ExportFormat = "text" | "json" | "csv";

const timeRangeSeconds: Record<TimeRange, number | null> = {
  all: null,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "6h": 6 * 60 * 60,
  "24h": 24 * 60 * 60,
};

const refreshOptions = [
  { label: "Live · 3s", value: 3000 },
  { label: "5 sec", value: 5000 },
  { label: "10 sec", value: 10000 },
  { label: "Paused", value: 0 },
];

function severityOf(entry: ContainerLogEntry): Severity {
  const message = entry.message.toLowerCase();
  if (/\b(fatal|panic|error|exception|failed|failure|critical)\b/.test(message)) return "error";
  if (/\b(warn|warning|deprecated|retry|timeout)\b/.test(message)) return "warning";
  if (/\b(debug|trace|verbose)\b/.test(message)) return "debug";
  if (/\b(info|ready|started|listening|connected|healthy|success)\b/.test(message)) return "info";
  return entry.stream === "stderr" ? "warning" : "other";
}

function displayTimestamp(timestamp: string | null) {
  if (!timestamp) return "--:--:--";
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return timestamp;
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: false });
}

function textLine(entry: ContainerLogEntry) {
  return `${entry.timestamp ?? ""} ${entry.stream.padEnd(6)} ${entry.message}`.trimEnd();
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "container";
}

export function ContainerLogsWorkspace({ containerId }: { containerId: string }) {
  const [logs, setLogs] = useState<ContainerLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stream, setStream] = useState<StreamFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("1h");
  const [tail, setTail] = useState(500);
  const [refreshInterval, setRefreshInterval] = useState(3000);
  const [wrap, setWrap] = useState(true);
  const [follow, setFollow] = useState(true);
  const [newestFirst, setNewestFirst] = useState(false);
  const [sessionSince, setSessionSince] = useState<number | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("text");
  const [copied, setCopied] = useState(false);
  const requestInFlight = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  const loadLogs = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);

    const rangeSeconds = timeRangeSeconds[timeRange];
    const rangeSince = rangeSeconds ? Math.floor(Date.now() / 1000) - rangeSeconds : null;
    const since = Math.max(rangeSince ?? 0, sessionSince ?? 0) || null;
    const query = new URLSearchParams({ tail: String(tail) });
    if (since !== null) query.set("since", String(since));

    try {
      const response = await fetch(`/api/containers/${encodeURIComponent(containerId)}/logs?${query}`, { cache: "no-store" });
      const body = (await response.json()) as ContainerLogs | { error?: string };
      if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Unable to load container logs");
      setLogs(body as ContainerLogs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load container logs");
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [containerId, sessionSince, tail, timeRange]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadLogs(), 0);
    return () => window.clearTimeout(initial);
  }, [loadLogs]);

  useEffect(() => {
    if (!refreshInterval) return;
    const timer = window.setInterval(() => void loadLogs(), refreshInterval);
    return () => window.clearInterval(timer);
  }, [loadLogs, refreshInterval]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const entries = (logs?.entries ?? []).filter((entry) => {
      if (stream !== "all" && entry.stream !== stream) return false;
      if (severity !== "all" && severityOf(entry) !== severity) return false;
      if (normalizedSearch && !`${entry.timestamp ?? ""} ${entry.message}`.toLowerCase().includes(normalizedSearch)) return false;
      return true;
    });
    return newestFirst ? entries.toReversed() : entries;
  }, [logs, newestFirst, search, severity, stream]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !follow || !filteredEntries.length) return;
    viewport.scrollTop = newestFirst ? 0 : viewport.scrollHeight;
  }, [filteredEntries, follow, newestFirst]);

  const severityCounts = useMemo(() => {
    return (logs?.entries ?? []).reduce(
      (counts, entry) => {
        counts[severityOf(entry)] += 1;
        return counts;
      },
      { error: 0, warning: 0, info: 0, debug: 0, other: 0 } as Record<Severity, number>,
    );
  }, [logs]);

  const activeFilters = [
    search.trim() ? `Search: ${search.trim()}` : null,
    stream !== "all" ? stream : null,
    severity !== "all" ? severity : null,
    timeRange !== "all" ? `Last ${timeRange}` : null,
  ].filter(Boolean) as string[];

  const resetFilters = () => {
    setSearch("");
    setStream("all");
    setSeverity("all");
    setTimeRange("all");
  };

  const clearView = () => {
    setSessionSince(Math.ceil(Date.now() / 1000));
    setLogs((current) => current ? { ...current, entries: [], summary: { ...current.summary, lines: 0, stdout_lines: 0, stderr_lines: 0, bytes: 0 } } : current);
  };

  const copyVisible = async () => {
    try {
      await navigator.clipboard.writeText(filteredEntries.map(textLine).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const exportVisible = () => {
    if (!logs) return;
    const exportedAt = new Date().toISOString();
    let content: string;
    let mimeType: string;
    let extension: string;

    if (exportFormat === "json") {
      content = JSON.stringify({ exported_at: exportedAt, container: logs.container, filters: { search, stream, severity, timeRange }, entries: filteredEntries }, null, 2);
      mimeType = "application/json";
      extension = "json";
    } else if (exportFormat === "csv") {
      content = [
        "timestamp,stream,severity,message",
        ...filteredEntries.map((entry) => [entry.timestamp ?? "", entry.stream, severityOf(entry), entry.message].map(csvCell).join(",")),
      ].join("\n");
      mimeType = "text/csv";
      extension = "csv";
    } else {
      content = filteredEntries.map(textLine).join("\n");
      mimeType = "text/plain";
      extension = "log";
    }

    const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(logs.container.name)}-${exportedAt.replaceAll(":", "-")}.${extension}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const containerName = logs?.container.name ?? containerId.slice(0, 12);
  const paused = refreshInterval === 0;

  return (
    <main className="logs-shell">
      <header className="logs-topbar">
        <Link className="logs-brand" href="/">
          <span className="brand-mark"><Activity size={20} /></span>
          <span><strong>A3S</strong><small>Infrastructure</small></span>
        </Link>
        <div className="logs-topbar-title"><span>Workloads</span><strong>Container logs</strong></div>
        <div className="logs-topbar-actions">
          <IconButton label="Refresh logs" onClick={() => void loadLogs()} disabled={refreshing}>
            <RefreshCw className={refreshing ? "spin" : undefined} size={18} />
          </IconButton>
          <IconLink href="/logout" label="Sign out"><LogOut size={18} /></IconLink>
        </div>
      </header>

      <div className="logs-content">
        <Link className="logs-back" href="/#containers"><ArrowLeft size={15} />Containers</Link>

        <header className="logs-page-heading">
          <div>
            <div className="logs-heading-line">
              <h1>{containerName}</h1>
              {logs ? <span className={`status-badge ${logs.container.status}`}><i />{logs.container.status}</span> : null}
            </div>
            <p>{logs?.container.image ?? "Loading container metadata"}</p>
          </div>
          <div className={`logs-live-state ${error ? "error" : paused ? "paused" : "live"}`}>
            <i />{error ? "Updates interrupted" : paused ? "Polling paused" : "Polling active"}
          </div>
        </header>

        {error ? (
          <div className="status-banner error logs-error" role="alert">
            <AlertTriangle size={18} />
            <div><strong>Logs unavailable</strong><span>{error}</span></div>
            <button onClick={() => void loadLogs()} type="button">Retry</button>
          </div>
        ) : null}

        <section className="logs-summary" aria-label="Log summary">
          <div><span>Retrieved</span><strong>{logs?.summary.lines.toLocaleString() ?? "—"}</strong><small>lines</small></div>
          <div><span>Errors</span><strong>{severityCounts.error.toLocaleString()}</strong><small>detected</small></div>
          <div><span>Standard error</span><strong>{logs?.summary.stderr_lines.toLocaleString() ?? "—"}</strong><small>lines</small></div>
          <div><span>Payload</span><strong>{logs ? formatBytes(logs.summary.bytes) : "—"}</strong><small>{logs?.summary.truncated ? "tail limited" : "retrieved"}</small></div>
        </section>

        <section className="logs-controls" aria-label="Log controls">
          <div className="logs-filter-row">
            <label className="logs-search">
              <Search size={16} />
              <span className="sr-only">Search logs</span>
              <input onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" type="search" value={search} />
            </label>
            <div className="segment-control logs-stream-filter" aria-label="Log stream" role="group">
              {(["all", "stdout", "stderr"] as const).map((option) => (
                <button aria-pressed={stream === option} key={option} onClick={() => setStream(option)} type="button">{option}</button>
              ))}
            </div>
            <label className="logs-select"><span>Severity</span><select onChange={(event) => setSeverity(event.target.value as SeverityFilter)} value={severity}>
              <option value="all">All levels</option><option value="error">Error</option><option value="warning">Warning</option><option value="info">Info</option><option value="debug">Debug</option><option value="other">Other</option>
            </select></label>
            <label className="logs-select"><span>Window</span><select onChange={(event) => setTimeRange(event.target.value as TimeRange)} value={timeRange}>
              <option value="15m">Last 15 min</option><option value="1h">Last hour</option><option value="6h">Last 6 hours</option><option value="24h">Last 24 hours</option><option value="all">All available</option>
            </select></label>
            <label className="logs-select"><span>Tail</span><select onChange={(event) => setTail(Number(event.target.value))} value={tail}>
              <option value={100}>100 lines</option><option value={500}>500 lines</option><option value={1000}>1,000 lines</option><option value={5000}>5,000 lines</option>
            </select></label>
          </div>

          <div className="logs-management-row">
            <label className="logs-select refresh-control"><span>Refresh</span><select onChange={(event) => setRefreshInterval(Number(event.target.value))} value={refreshInterval}>
              {refreshOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
            <button aria-pressed={wrap} className="logs-toggle" onClick={() => setWrap((value) => !value)} type="button"><WrapText size={15} />Wrap</button>
            <button aria-pressed={follow} className="logs-toggle" onClick={() => setFollow((value) => !value)} type="button"><ChevronsDown size={15} />Follow</button>
            <IconButton label={newestFirst ? "Show oldest first" : "Show newest first"} onClick={() => setNewestFirst((value) => !value)}><ArrowUpDown size={17} /></IconButton>
            <IconButton label={copied ? "Copied" : "Copy visible logs"} onClick={() => void copyVisible()} disabled={!filteredEntries.length}>{copied ? <Check size={17} /> : <Clipboard size={17} />}</IconButton>
            <IconButton label="Clear visible logs" onClick={clearView}><Eraser size={17} /></IconButton>
            <div className="logs-export">
              <label className="logs-select"><span>Export</span><select onChange={(event) => setExportFormat(event.target.value as ExportFormat)} value={exportFormat}>
                <option value="text">Plain text</option><option value="json">JSON</option><option value="csv">CSV</option>
              </select></label>
              <IconButton label={`Export visible logs as ${exportFormat}`} onClick={exportVisible} disabled={!filteredEntries.length}><Download size={17} /></IconButton>
            </div>
          </div>

          <div className="logs-active-filters">
            <span>Showing <strong>{filteredEntries.length.toLocaleString()}</strong> of {(logs?.entries.length ?? 0).toLocaleString()}</span>
            <div>
              {activeFilters.map((filter) => <span className="filter-chip" key={filter}>{filter}</span>)}
              {activeFilters.length ? <button onClick={resetFilters} type="button">Reset filters</button> : <small>No active filters</small>}
            </div>
          </div>
        </section>

        <section className="logs-console" aria-label={`${containerName} logs`}>
          <header>
            <div><SquareTerminal size={17} /><strong>Log output</strong></div>
            <span>{newestFirst ? "Newest first" : "Chronological"}</span>
          </header>
          <div className={`logs-viewport ${wrap ? "wrap" : "nowrap"}`} ref={viewportRef}>
            {loading ? <div className="logs-loading"><span /><span /><span /><span /></div> : null}
            {!loading && !filteredEntries.length ? (
              <div className="logs-empty"><SquareTerminal size={24} /><strong>No matching log lines</strong><span>Adjust the filters or wait for new output.</span></div>
            ) : null}
            {filteredEntries.map((entry, index) => {
              const entrySeverity = severityOf(entry);
              return (
                <div className={`log-line severity-${entrySeverity}`} key={`${entry.timestamp ?? "untimed"}-${entry.stream}-${index}`}>
                  <span className="log-line-number">{index + 1}</span>
                  <time dateTime={entry.timestamp ?? undefined} title={entry.timestamp ?? "No timestamp"}>{displayTimestamp(entry.timestamp)}</time>
                  <span className={`log-stream ${entry.stream}`}>{entry.stream}</span>
                  <span className={`log-severity ${entrySeverity}`}>{entrySeverity}</span>
                  <code>{entry.message}{entry.truncated ? " …" : ""}</code>
                </div>
              );
            })}
          </div>
          <footer>
            <span>{logs?.collected_at ? `Collected ${new Date(logs.collected_at).toLocaleTimeString()}` : "Waiting for first collection"}</span>
            <span>{logs?.summary.truncated ? "More lines exist outside the selected tail" : `${filteredEntries.length.toLocaleString()} visible lines`}</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
