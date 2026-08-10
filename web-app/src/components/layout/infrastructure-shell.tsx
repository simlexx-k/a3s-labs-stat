"use client";

import { Activity, Box, Cpu, Gauge, HardDrive, LogOut, Menu, Network, ScrollText, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { IconButton, IconLink } from "@/components/ui/icon-button";

type ActiveView = "overview" | "containers" | "logs" | "resources" | "storage" | "network";
type ConnectionTone = "live" | "error" | "pending";

type InfrastructureShellProps = {
  activeView: ActiveView;
  children: ReactNode;
  connectionLabel: string;
  connectionTone: ConnectionTone;
  containerCount?: number;
  contentClassName?: string;
  hostname?: string;
  lastUpdated?: Date | null;
  locationTitle: string;
  topbarActions?: ReactNode;
};

const navItems: Array<{ href: string; icon: ReactNode; id: ActiveView; label: string }> = [
  { href: "/", icon: <Gauge size={17} />, id: "overview", label: "Overview" },
  { href: "/#containers", icon: <Box size={17} />, id: "containers", label: "Containers" },
  { href: "/logs", icon: <ScrollText size={17} />, id: "logs", label: "Logs" },
  { href: "/#resources", icon: <Cpu size={17} />, id: "resources", label: "Resources" },
  { href: "/#storage", icon: <HardDrive size={17} />, id: "storage", label: "Storage" },
  { href: "/#network", icon: <Network size={17} />, id: "network", label: "Network" },
];

export function InfrastructureShell({
  activeView,
  children,
  connectionLabel,
  connectionTone,
  containerCount = 0,
  contentClassName = "workspace-content",
  hostname,
  lastUpdated,
  locationTitle,
  topbarActions,
}: InfrastructureShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <main className="app-shell">
      <button className={`nav-scrim ${mobileNavOpen ? "visible" : ""}`} aria-label="Close navigation" onClick={closeMobileNav} type="button" />
      <aside className={`sidebar ${mobileNavOpen ? "open" : ""}`}>
        <div className="brand-row">
          <Link className="brand" href="/" onClick={closeMobileNav}>
            <span className="brand-mark"><Activity size={20} /></span>
            <span><strong>A3S</strong><small>Infrastructure</small></span>
          </Link>
          <IconButton className="sidebar-close" label="Close navigation" onClick={closeMobileNav}><X size={18} /></IconButton>
        </div>

        <nav className="side-nav" aria-label="Dashboard navigation">
          <p>Workspace</p>
          {navItems.slice(0, 3).map((item) => (
            <Link className={activeView === item.id ? "active" : undefined} href={item.href} key={item.id} onClick={closeMobileNav}>
              {item.icon}<span>{item.label}</span>
              {item.id === "containers" && containerCount ? <b>{containerCount}</b> : null}
            </Link>
          ))}
          <p>Telemetry</p>
          {navItems.slice(3).map((item) => (
            <Link className={activeView === item.id ? "active" : undefined} href={item.href} key={item.id} onClick={closeMobileNav}>
              {item.icon}<span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="sidebar-status-heading">
            <span className={`connection-dot ${connectionTone}`} />
            <strong>{connectionLabel}</strong>
          </div>
          <p>{hostname ?? "Waiting for host"}</p>
          {lastUpdated ? <small>Updated {lastUpdated.toLocaleTimeString()}</small> : null}
        </div>
        <div className="sidebar-footer"><ShieldCheck size={14} /> Read-only console</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-location">
            <IconButton className="menu-button" label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></IconButton>
            <div><span>Infrastructure</span><strong>{locationTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            {topbarActions}
            <IconLink href="/logout" label="Sign out"><LogOut size={18} /></IconLink>
          </div>
        </header>

        <div className={contentClassName}>{children}</div>
      </section>
    </main>
  );
}
