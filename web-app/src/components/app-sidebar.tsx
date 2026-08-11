"use client"

import {
  Bell,
  Box,
  Cpu,
  Gauge,
  HardDrive,
  History,
  Network,
  ScrollText,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react"
import Image from "next/image"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"

export type ActiveView =
  | "overview"
  | "containers"
  | "logs"
  | "alerts"
  | "history"
  | "resources"
  | "storage"
  | "network"

type ConnectionTone = "live" | "error" | "pending"

type NavigationItem = {
  href: string
  icon: LucideIcon
  id: ActiveView
  label: string
}

type NavigationGroup = {
  label: string
  items: NavigationItem[]
}

const navigation: NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", icon: Gauge, id: "overview", label: "Overview" },
      { href: "/#containers", icon: Box, id: "containers", label: "Containers" },
      { href: "/logs", icon: ScrollText, id: "logs", label: "Logs" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/alerts", icon: Bell, id: "alerts", label: "Alerts" },
      { href: "/history", icon: History, id: "history", label: "History" },
    ],
  },
  {
    label: "Telemetry",
    items: [
      { href: "/#resources", icon: Cpu, id: "resources", label: "Resources" },
      { href: "/#storage", icon: HardDrive, id: "storage", label: "Storage" },
      { href: "/#network", icon: Network, id: "network", label: "Network" },
    ],
  },
]

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  activeView: ActiveView
  connectionLabel: string
  connectionTone: ConnectionTone
  containerCount: number
  hostname?: string
  lastUpdated?: Date | null
}

export function AppSidebar({
  activeView,
  connectionLabel,
  connectionTone,
  containerCount,
  hostname,
  lastUpdated,
  ...props
}: AppSidebarProps) {
  const { setOpenMobile } = useSidebar()
  const closeMobileNavigation = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-1">
              <SidebarMenuButton asChild className="h-12 flex-1" size="lg" tooltip="A3S Infrastructure">
                {/* Full navigation lets Cloudflare Access reauthenticate an expired session. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" onClick={closeMobileNavigation}>
                  <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-primary">
                    <Image
                      alt=""
                      className="size-full object-cover"
                      height={32}
                      priority
                      src="/brand/a3s-logo-dark-tile.png"
                      width={32}
                    />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <strong className="truncate text-sm font-semibold">A3S</strong>
                    <span className="truncate text-xs text-sidebar-foreground/60">Infrastructure</span>
                  </span>
                </a>
              </SidebarMenuButton>
              <Button
                aria-label="Close navigation"
                className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
                onClick={closeMobileNavigation}
                size="icon-sm"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Dashboard navigation" className="flex flex-col py-1">
          {navigation.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = activeView === item.id

                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          className={isActive ? "active" : undefined}
                          isActive={isActive}
                          tooltip={item.label}
                        >
                          <a href={item.href} onClick={closeMobileNavigation}>
                            <Icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </a>
                        </SidebarMenuButton>
                        {item.id === "containers" && containerCount > 0 ? (
                          <SidebarMenuBadge>{containerCount}</SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-auto cursor-default py-2 hover:bg-transparent" size="lg" tooltip={connectionLabel}>
              <span className={`connection-dot ${connectionTone}`} />
              <span className="grid min-w-0 flex-1 gap-0.5 text-left leading-tight">
                <strong className="truncate text-xs font-medium">{connectionLabel}</strong>
                <span className="truncate text-[11px] text-sidebar-foreground/55">{hostname ?? "Waiting for host"}</span>
                {lastUpdated ? (
                  <span className="truncate text-[10px] text-sidebar-foreground/45">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                ) : null}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton className="cursor-default text-sidebar-foreground/55 hover:bg-transparent" tooltip="Access controlled">
              <ShieldCheck aria-hidden="true" />
              <span>Access controlled</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
