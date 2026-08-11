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
    <Sidebar className="app-sidebar" collapsible="icon" {...props}>
      <SidebarHeader className="app-sidebar-header">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="app-sidebar-brand-row">
              <SidebarMenuButton asChild className="app-sidebar-brand" size="lg" tooltip="A3S Infrastructure">
                {/* Full navigation lets Cloudflare Access reauthenticate an expired session. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" onClick={closeMobileNavigation}>
                  <span className="app-sidebar-brand-mark">
                    <Image
                      alt=""
                      className="size-full object-cover"
                      height={36}
                      priority
                      src="/brand/a3s-logo-dark-tile.png"
                      width={36}
                    />
                  </span>
                  <span className="app-sidebar-brand-copy">
                    <strong>A3S</strong>
                    <span>Infrastructure Console</span>
                  </span>
                </a>
              </SidebarMenuButton>
              <Button
                aria-label="Close navigation"
                className="app-sidebar-close md:hidden"
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

      <SidebarContent className="app-sidebar-content">
        <nav aria-label="Dashboard navigation" className="app-sidebar-navigation">
          {navigation.map((group) => (
            <SidebarGroup className="app-sidebar-group" key={group.label}>
              <SidebarGroupLabel className="app-sidebar-group-label">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = activeView === item.id

                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          className="app-sidebar-link"
                          isActive={isActive}
                          tooltip={item.label}
                        >
                          <a href={item.href} onClick={closeMobileNavigation}>
                            <Icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </a>
                        </SidebarMenuButton>
                        {item.id === "containers" && containerCount > 0 ? (
                          <SidebarMenuBadge className="app-sidebar-badge">{containerCount}</SidebarMenuBadge>
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

      <SidebarSeparator className="app-sidebar-separator" />
      <SidebarFooter className="app-sidebar-footer">
        <div className="app-sidebar-status" title={connectionLabel}>
          <span className={`connection-dot ${connectionTone}`} />
          <span className="app-sidebar-status-copy">
            <strong>{connectionLabel}</strong>
            <span>{hostname ?? "Waiting for host"}</span>
            {lastUpdated ? <small>Updated {lastUpdated.toLocaleTimeString()}</small> : null}
          </span>
        </div>
        <div className="app-sidebar-access" title="Cloudflare Access protected">
          <ShieldCheck aria-hidden="true" />
          <span>Cloudflare Access</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
