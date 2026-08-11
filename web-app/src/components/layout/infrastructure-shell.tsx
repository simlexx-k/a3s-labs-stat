"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
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
      className="bg-[var(--canvas)]"
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
    >
      <AppSidebar
        activeView={activeView}
        connectionLabel={connectionLabel}
        connectionTone={connectionTone}
        containerCount={containerCount}
        hostname={hostname}
        lastUpdated={lastUpdated}
      />
      <SidebarInset className="min-w-0 overflow-x-hidden bg-[var(--canvas)]">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-white/95 px-3 backdrop-blur-sm sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger aria-label="Open navigation" className="shrink-0" />
            <Separator className="h-4" orientation="vertical" />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="min-w-0 flex-nowrap">
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <span>Infrastructure</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:list-item" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="block max-w-[45vw] truncate font-medium sm:max-w-[50vw]">
                    {locationTitle}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {topbarActions}
            <Button asChild size="icon" title="Sign out" variant="outline">
              <Link aria-label="Sign out" href="/logout"><LogOut aria-hidden="true" /></Link>
            </Button>
          </div>
        </header>
        <div className={contentClassName}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
