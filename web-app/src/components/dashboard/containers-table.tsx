"use client";

import { ChevronDown, ChevronRight, Network, Search, ServerCog } from "lucide-react";
import { useMemo, useState } from "react";
import { formatBytes, healthTone, type Container } from "@/lib/telemetry";

type Filter = "all" | "running" | "stopped";

export function ContainersTable({ containers }: { containers: Container[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleContainers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...containers]
      .filter((container) => {
        const matchesQuery = !normalizedQuery || `${container.name} ${container.image_tags[0] ?? container.image}`.toLowerCase().includes(normalizedQuery);
        const matchesFilter = filter === "all" || (filter === "running" ? container.status === "running" : container.status !== "running");
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => b.stats.cpu_percent - a.stats.cpu_percent);
  }, [containers, filter, query]);

  return (
    <section className="panel workload-panel" id="containers">
      <div className="panel-heading workload-heading">
        <div>
          <p className="eyebrow">Workloads</p>
          <h2>Containers</h2>
        </div>
        <span className="heading-count">{visibleContainers.length} shown</span>
      </div>
      <div className="table-toolbar">
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Search containers</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search containers" type="search" value={query} />
        </label>
        <div className="segment-control" aria-label="Container status" role="group">
          {(["all", "running", "stopped"] as const).map((option) => (
            <button aria-pressed={filter === option} key={option} onClick={() => setFilter(option)} type="button">
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="containers-table">
          <thead>
            <tr>
              <th aria-label="Expand row" />
              <th>Container</th>
              <th>Status</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Traffic</th>
              <th>Restarts</th>
            </tr>
          </thead>
          <tbody>
            {visibleContainers.map((container) => {
              const expanded = expandedId === container.id;
              return (
                <ContainerRows
                  container={container}
                  expanded={expanded}
                  key={container.id}
                  onToggle={() => setExpandedId(expanded ? null : container.id)}
                />
              );
            })}
            {!visibleContainers.length ? (
              <tr>
                <td className="table-empty" colSpan={7}>
                  <ServerCog size={24} />
                  <strong>No matching containers</strong>
                  <span>Change the search or status filter.</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContainerRows({ container, expanded, onToggle }: { container: Container; expanded: boolean; onToggle: () => void }) {
  const imageName = container.image_tags[0] || container.image;
  const ports = Object.entries(container.ports);

  return (
    <>
      <tr className={expanded ? "expanded" : undefined}>
        <td className="expand-cell">
          <button aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${container.name}`} onClick={onToggle} type="button">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td>
          <button className="container-identity" onClick={onToggle} type="button">
            <span className="container-glyph"><span /></span>
            <span>
              <strong>{container.name}</strong>
              <small title={imageName}>{imageName}</small>
            </span>
          </button>
        </td>
        <td><span className={`status-badge ${container.status}`}><i />{container.status}</span></td>
        <td className="usage-cell">
          <strong>{container.stats.cpu_percent.toFixed(1)}%</strong>
          <span className="mini-meter"><i className={healthTone(container.stats.cpu_percent)} style={{ width: `${Math.min(container.stats.cpu_percent, 100)}%` }} /></span>
        </td>
        <td>
          <strong className="cell-primary">{formatBytes(container.stats.memory_usage)}</strong>
          <span className="cell-secondary">{container.stats.memory_percent.toFixed(1)}% of limit</span>
        </td>
        <td>
          <span className="traffic-cell"><Network size={14} /> {formatBytes(container.stats.network.rx_bytes)} / {formatBytes(container.stats.network.tx_bytes)}</span>
        </td>
        <td><span className={container.restart_count > 0 ? "restart-count warning" : "restart-count"}>{container.restart_count}</span></td>
      </tr>
      {expanded ? (
        <tr className="detail-row">
          <td />
          <td colSpan={6}>
            <dl className="container-details">
              <div><dt>CPU</dt><dd>{container.stats.cpu_percent.toFixed(1)}%</dd></div>
              <div><dt>Memory</dt><dd>{formatBytes(container.stats.memory_usage)} ({container.stats.memory_percent.toFixed(1)}%)</dd></div>
              <div><dt>Traffic</dt><dd>{formatBytes(container.stats.network.rx_bytes)} / {formatBytes(container.stats.network.tx_bytes)}</dd></div>
              <div><dt>Container ID</dt><dd className="mono">{container.id.slice(0, 12)}</dd></div>
              <div><dt>Processes</dt><dd>{container.stats.pids}</dd></div>
              <div><dt>Networks</dt><dd>{container.networks.join(", ") || "None"}</dd></div>
              <div><dt>Ports</dt><dd>{ports.length ? ports.map(([port]) => port).join(", ") : "None exposed"}</dd></div>
              <div><dt>Block read</dt><dd>{formatBytes(container.stats.block_io.read_bytes)}</dd></div>
              <div><dt>Block write</dt><dd>{formatBytes(container.stats.block_io.write_bytes)}</dd></div>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}
