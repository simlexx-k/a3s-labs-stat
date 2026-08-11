"use client";

import { CircleUserRound, LogOut } from "lucide-react";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { AppSidebar, type ActiveView } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

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
  return (
    <SidebarProvider
      className="shell-root"
      style={{ "--sidebar-width": "16.5rem", "--sidebar-width-icon": "4rem" } as CSSProperties}
    >
      <AppSidebar
        activeView={activeView}
        connectionLabel={connectionLabel}
        connectionTone={connectionTone}
        containerCount={containerCount}
        hostname={hostname}
        lastUpdated={lastUpdated}
      />
      <SidebarInset className="shell-main">
        <header className="shell-header">
          <div className="shell-header-location">
            <SidebarTrigger aria-label="Open navigation" className="shell-menu-trigger" size="icon-lg" />
            <Separator className="shell-header-separator" orientation="vertical" />
            <div className="shell-mobile-brand" aria-label={`A3S Infrastructure, ${locationTitle}`}>
              <Image alt="" height={30} priority src="/brand/a3s-logo-dark-tile.png" width={30} />
              <span>
                <small>A3S Infrastructure</small>
                <strong>{locationTitle}</strong>
              </span>
            </div>
            <Breadcrumb className="shell-breadcrumb">
              <BreadcrumbList className="min-w-0 flex-nowrap">
                <BreadcrumbItem>
                  <span>Infrastructure</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="shell-location-title">
                    {locationTitle}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="shell-header-actions">
            {topbarActions ? <div className="shell-page-actions">{topbarActions}</div> : null}
            <Button asChild className="shell-profile" size="icon-lg" title="Open profile" variant="ghost">
              <a aria-label="Open profile" href="/account"><CircleUserRound aria-hidden="true" /></a>
            </Button>
            <Button asChild className="shell-signout" size="icon-lg" title="Sign out" variant="outline">
              <a aria-label="Sign out" href="/logout"><LogOut aria-hidden="true" /></a>
            </Button>
          </div>
        </header>
        <div className="shell-scroll-region" data-shell-scroll>
          <div className={contentClassName}>{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
