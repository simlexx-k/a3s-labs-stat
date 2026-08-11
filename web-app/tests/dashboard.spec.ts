import { expect, test, type Page } from "@playwright/test";

let sample = 0;

function statsFixture() {
  sample += 1;
  return {
    collected_at: new Date().toISOString(),
    vps: {
      hostname: "a3s-prod-01",
      fqdn: "a3s-prod-01.internal",
      platform: "Ubuntu 24.04.2 LTS · Linux 6.8.0-52-generic",
      system: "Linux",
      release: "24.04",
      kernel: "6.8.0-52",
      architecture: "x86_64",
      uptime_seconds: 1923842,
      cpu: {
        physical_cores: 4,
        logical_cores: 8,
        percent: 31 + sample * 2,
        per_cpu_percent: [22, 41, 17, 66, 29, 35, 48, 18],
        load_average: { "1m": 1.42, "5m": 1.18, "15m": 0.94 },
      },
      memory: { total: 17179869184, used: 9878424780, available: 7301444404, free: 7301444404, percent: 57.5 },
      swap: { total: 4294967296, used: 386547056, free: 3908420240, percent: 9 },
      disks: [
        { device: "/dev/nvme0n1p2", mountpoint: "/", fstype: "ext4", total: 214748364800, used: 133143986176, available: 81604378624, percent: 62 },
        { device: "/dev/sdb1", mountpoint: "/data", fstype: "xfs", total: 536870912000, used: 161061273600, available: 375809638400, percent: 30 },
      ],
      network: {
        eth0: { bytes_sent: 8428873312 + sample * 580000, bytes_recv: 21984288768 + sample * 1240000, packets_sent: 9433441, packets_recv: 14345900 },
        docker0: { bytes_sent: 5028873312 + sample * 240000, bytes_recv: 3984288768 + sample * 460000, packets_sent: 4733441, packets_recv: 6345900 },
      },
    },
    docker: {
      available: true,
      error: null,
      version: { version: "27.5.1", api_version: "1.47", os: "linux", arch: "amd64" },
      info: { operating_system: "Ubuntu 24.04.2 LTS", storage_driver: "overlay2", cgroup_driver: "systemd", docker_root_dir: "/var/lib/docker" },
      summary: { containers_total: 6, containers_running: 5, containers_stopped: 1, images: 14 },
      containers: [
        container("api-gateway", "ghcr.io/a3s/gateway:2.8.1", "running", 18.4, 734003200, 8.5, 0),
        container("worker-primary", "ghcr.io/a3s/worker:4.2.0", "running", 12.8, 1288490188, 15, 1),
        container("postgres", "postgres:16.3-alpine", "running", 7.2, 2576980377, 30, 0),
        container("redis-cache", "redis:7.4-alpine", "running", 2.1, 314572800, 3.7, 0),
        container("traefik", "traefik:v3.1", "running", 1.4, 209715200, 2.4, 0),
        container("migrations", "ghcr.io/a3s/api:4.2.0", "exited", 0, 0, 0, 0),
      ],
    },
  };
}

function container(name: string, image: string, status: string, cpu: number, memory: number, memoryPercent: number, restarts: number) {
  const fullId = Array.from(name)
    .map((character) => character.charCodeAt(0).toString(16))
    .join("")
    .padEnd(64, "0")
    .slice(0, 64);

  return {
    id: fullId.slice(0, 12),
    full_id: fullId,
    name,
    image,
    image_tags: [image],
    status,
    started_at: "2026-08-07T09:40:00Z",
    restart_count: restarts,
    ports: status === "running" ? { "8080/tcp": [{ HostPort: "8080" }] } : {},
    labels: {},
    networks: ["a3s_default"],
    stats: {
      cpu_percent: cpu,
      memory_usage: memory,
      memory_limit: 8589934592,
      memory_percent: memoryPercent,
      network: { rx_bytes: 528482304, tx_bytes: 214958080 },
      block_io: { read_bytes: 1073741824, write_bytes: 429916160 },
      pids: status === "running" ? 23 : 0,
    },
  };
}

async function openDashboard(page: Page) {
  await page.route(/\/api\/stats$/, async (route) => {
    await route.fulfill({ body: JSON.stringify(statsFixture()), contentType: "application/json", status: 200 });
  });
  await page.goto("http://localhost:3001");
  await expect(page.getByRole("heading", { name: "a3s-prod-01" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Refresh telemetry" }).click();
  await expect(page.getByText("Building live history")).toHaveCount(0);
}

test("desktop dashboard has no viewport overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openDashboard(page);
  await expect(page.getByRole("link", { name: "Sign out" })).toHaveAttribute("href", "/logout");
  await expect(page.getByRole("link", { name: "View api-gateway logs" })).toHaveAttribute("href", /\/logs\?container=[a-f0-9]{64}/);
  await expect(page.getByRole("link", { name: "Logs", exact: true })).toHaveAttribute("href", "/logs");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.locator("[data-shell-scroll]").evaluate((region) => { region.scrollTop = region.scrollHeight; });
  const shellPosition = await page.locator('[data-slot="sidebar-container"]').evaluate((sidebar) => {
    const bounds = sidebar.getBoundingClientRect();
    return { bottom: Math.round(bounds.bottom), position: getComputedStyle(sidebar).position, top: Math.round(bounds.top) };
  });
  expect(shellPosition).toEqual({ bottom: 600, position: "fixed", top: 0 });
  await expect(page.locator(".shell-header")).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Dashboard navigation" })).toBeVisible();
  await page.locator("[data-shell-scroll]").evaluate((region) => { region.scrollTop = 0; });
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-dashboard-desktop.png" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator('[data-slot="sidebar"][data-state="collapsed"]')).toBeVisible();
  await expect.poll(() => page.locator('[data-slot="sidebar-container"]').evaluate((sidebar) => Math.round(sidebar.getBoundingClientRect().width))).toBe(64);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-dashboard-desktop-collapsed.png" });
});

test("mobile dashboard and navigation fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Expand api-gateway" }).click();
  await expect(page.getByRole("link", { name: "Open logs" })).toHaveAttribute("href", /\/logs\?container=[a-f0-9]{64}/);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Dashboard navigation" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ fullPage: false, path: "/tmp/a3s-dashboard-mobile-nav.png" });
  await page.getByRole("button", { name: "Close navigation" }).last().click();
  await page.waitForTimeout(250);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-dashboard-mobile.png" });
});

test("offline state does not expose the upstream service", async ({ page }) => {
  await page.route(/\/api\/stats$/, async (route) => {
    await route.fulfill({ body: JSON.stringify({ error: "Telemetry service unavailable" }), contentType: "application/json", status: 502 });
  });
  await page.goto("http://localhost:3001");
  await expect(page.getByRole("heading", { name: "Telemetry is offline" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("API");
  await expect(page.locator("body")).not.toContainText("localhost:8080");
  await expect(page.locator("body")).not.toContainText("stats-api");
});

test("expired Access sessions recover with a top-level navigation", async ({ page }) => {
  let documentRequests = 0;

  await page.route("http://localhost:3001/", async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }

    documentRequests += 1;
    if (documentRequests === 1) {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: "<!doctype html><html><body><h1>Access login resumed</h1></body></html>",
      contentType: "text/html",
      status: 200,
    });
  });
  await page.route(/\/api\/stats$/, async (route) => {
    await route.fulfill({
      headers: { location: "https://a3slabs.cloudflareaccess.com/cdn-cgi/access/login/istatus.a3slabs.co.ke" },
      status: 302,
    });
  });

  await page.goto("http://localhost:3001/", { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await expect.poll(() => documentRequests).toBe(2);
  await expect(page.getByRole("heading", { name: "Access login resumed" })).toBeVisible();
});
