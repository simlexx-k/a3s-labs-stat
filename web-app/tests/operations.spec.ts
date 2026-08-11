import { expect, test, type Page } from "@playwright/test";

const containerId = "d".repeat(64);
const now = Math.floor(Date.now() / 1000);

const stats = {
  collected_at: new Date().toISOString(),
  vps: { hostname: "a3s-prod-01" },
  docker: {
    summary: { containers_total: 3, containers_running: 3, containers_stopped: 0, images: 8 },
    containers: [{
      id: containerId.slice(0, 12), full_id: containerId, name: "api-gateway", image: "ghcr.io/a3s/gateway:2.8.1", image_tags: ["ghcr.io/a3s/gateway:2.8.1"], status: "running", health: "healthy", started_at: new Date().toISOString(), restart_count: 1, ports: {}, labels: {}, networks: ["a3s_default"],
      stats: { cpu_percent: 18.4, memory_usage: 734003200, memory_limit: 8589934592, memory_percent: 8.5, network: { rx_bytes: 528482304, tx_bytes: 214958080 }, block_io: { read_bytes: 1073741824, write_bytes: 429916160 }, pids: 23 },
    }],
  },
};

const detail = {
  collected_at: new Date().toISOString(),
  container: {
    id: containerId.slice(0, 12), full_id: containerId, name: "api-gateway", image: "ghcr.io/a3s/gateway:2.8.1", status: "running", created: "2026-08-01T10:00:00Z", started_at: "2026-08-11T08:00:00Z", finished_at: null, exit_code: 0, error: "", restart_count: 1, platform: "linux", driver: "overlay2", command: ["node", "server.js"], entrypoint: ["/entrypoint.sh"], working_dir: "/app", user: "node", hostname: "api-gateway", restart_policy: { Name: "unless-stopped" }, resources: { memory: 8589934592, nano_cpus: 2000000000, pids_limit: 256 },
    health: { status: "healthy", failing_streak: 0, recent_checks: [] },
    ports: [{ container_port: "8080/tcp", host_ip: "0.0.0.0", host_port: "8080" }],
    networks: [{ name: "a3s_default", network_id: "network-1", endpoint_id: "endpoint-1", ip_address: "172.18.0.4", gateway: "172.18.0.1", mac_address: "02:42:ac:12:00:04", aliases: ["api"] }],
    mounts: [{ type: "volume", name: "api-data", source: "/var/lib/docker/volumes/api-data", destination: "/app/data", driver: "local", mode: "rw", rw: true, propagation: "" }],
    labels: { "com.docker.compose.service": "api" }, environment: [{ key: "NODE_ENV", value: "production" }, { key: "API_TOKEN", value: "[redacted]" }],
  },
};

const samples = Array.from({ length: 18 }, (_, index) => ({ timestamp: now - (17 - index) * 300, name: "api-gateway", status: "running", health: "healthy", cpu_percent: 10 + index / 2, memory_percent: 8 + index / 4, restart_count: 1 }));
const hostSamples = samples.map((sample, index) => ({ timestamp: sample.timestamp, collected_at: new Date(sample.timestamp * 1000).toISOString(), cpu_percent: 20 + index, memory_percent: 50 + index / 2, disk_percent: 62, network_rx_bytes: 20_000_000 + index * 1000, network_tx_bytes: 8_000_000 + index * 500, containers_running: 3, containers_total: 3 }));

async function mockCommon(page: Page) {
  await page.route(/\/api\/stats$/, (route) => route.fulfill({ body: JSON.stringify(stats), contentType: "application/json" }));
  await page.route(/\/api\/session$/, (route) => route.fulfill({ body: JSON.stringify({ email: "ops@a3slabs.co.ke", role: "operator", expires_at: now + 3600 }), contentType: "application/json" }));
}

test("container details expose structured inspection and guarded actions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockCommon(page);
  let requestedAction = "";
  await page.route(new RegExp(`/api/containers/${containerId}$`), async (route) => {
    if (route.request().method() === "POST") {
      requestedAction = (route.request().postDataJSON() as { action: string }).action;
      await route.fulfill({ body: JSON.stringify({ status: "running" }), contentType: "application/json" });
      return;
    }
    await route.fulfill({ body: JSON.stringify(detail), contentType: "application/json" });
  });
  await page.route(new RegExp(`/api/containers/${containerId}/history`), (route) => route.fulfill({ body: JSON.stringify({ samples }), contentType: "application/json" }));
  await page.route(new RegExp(`/api/containers/${containerId}/events(\\?|$)`), (route) => route.fulfill({ body: JSON.stringify({ events: [] }), contentType: "application/json" }));
  await page.route(new RegExp(`/api/containers/${containerId}/events/stream`), (route) => route.fulfill({ body: "event: ready\ndata: {\"connected\":true}\n\n", contentType: "text/event-stream" }));

  await page.goto(`http://localhost:3001/containers/${containerId}`);
  await expect(page.getByRole("heading", { name: "api-gateway" })).toBeVisible();
  await expect(page.locator(".workspace-page-header")).toBeVisible();
  await expect(page.locator(".workspace-summary")).toBeVisible();
  await expect(page.getByText("Resource history")).toBeVisible();
  await page.getByRole("button", { name: "inspect" }).click();
  await expect(page.getByText("[redacted]")).toBeVisible();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Restart container" }).click();
  await expect.poll(() => requestedAction).toBe("restart");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-container-detail-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-container-detail-mobile.png" });
});

test("alerts support filtering, acknowledgement, and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCommon(page);
  const alerts = { summary: { active: 2, critical: 1, acknowledged: 0 }, alerts: [
    { alert_key: "host:cpu", title: "High CPU utilization", category: "resource", severity: "warning", status: "active", value: 91, threshold: 85, unit: "%", target_id: null, target_name: null, opened_at: now - 900, updated_at: now, resolved_at: null, acknowledged_at: null, acknowledged_by: null },
    { alert_key: `container:${containerId}:health`, title: "api-gateway is unhealthy", category: "container", severity: "critical", status: "active", value: 1, threshold: 0, unit: null, target_id: containerId, target_name: "api-gateway", opened_at: now - 300, updated_at: now, resolved_at: null, acknowledged_at: null, acknowledged_by: null },
  ] };
  await page.route(/\/api\/alerts\?/, (route) => route.fulfill({ body: JSON.stringify(alerts), contentType: "application/json" }));
  await page.route(/\/api\/audit\?/, (route) => route.fulfill({ body: JSON.stringify({ events: [] }), contentType: "application/json" }));
  await page.route(/\/api\/alerts\/.*\/acknowledge$/, (route) => route.fulfill({ body: JSON.stringify({ acknowledged: true }), contentType: "application/json" }));

  await page.goto("http://localhost:3001/alerts");
  await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
  await expect(page.locator(".workspace-page-header")).toBeVisible();
  await expect(page.locator(".workspace-summary")).toBeVisible();
  await expect(page.getByText("api-gateway is unhealthy")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Alerts", exact: true })).toHaveClass(/active/);
  await page.getByRole("button", { name: "Close navigation" }).last().click();
  await page.waitForTimeout(250);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-alerts-mobile.png" });
});

test("persistent history renders at desktop and mobile widths", async ({ page }) => {
  await mockCommon(page);
  await page.route(/\/api\/history\?/, (route) => route.fulfill({ body: JSON.stringify({ samples: hostSamples }), contentType: "application/json" }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://localhost:3001/history");
  await expect(page.getByRole("heading", { name: "Telemetry history" })).toBeVisible();
  await expect(page.locator(".workspace-page-header")).toBeVisible();
  await expect(page.locator(".workspace-summary")).toBeVisible();
  await expect(page.getByText("CPU and memory")).toBeVisible();
  await expect(page.getByRole("region", { name: "History summary" })).toContainText("18");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-history-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-history-mobile.png" });
});
