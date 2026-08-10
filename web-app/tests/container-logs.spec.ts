import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const containerId = "a".repeat(64);

const logsFixture = {
  collected_at: "2026-08-10T12:34:56.000Z",
  container: {
    id: containerId.slice(0, 12),
    full_id: containerId,
    name: "api-gateway",
    image: "ghcr.io/a3s/gateway:2.8.1",
    status: "running",
  },
  query: { tail: 500, since: null },
  entries: [
    { timestamp: "2026-08-10T12:34:51.100Z", stream: "stdout", message: "INFO service ready on port 8080", truncated: false },
    { timestamp: "2026-08-10T12:34:52.200Z", stream: "stderr", message: "WARN upstream retry scheduled", truncated: false },
    { timestamp: "2026-08-10T12:34:53.300Z", stream: "stderr", message: "ERROR database connection failed", truncated: false },
    { timestamp: "2026-08-10T12:34:54.400Z", stream: "stdout", message: "DEBUG health probe completed", truncated: false },
    { timestamp: "2026-08-10T12:34:55.500Z", stream: "stdout", message: "request completed with status 200", truncated: false },
  ],
  summary: { lines: 5, stdout_lines: 3, stderr_lines: 2, bytes: 184, truncated: false },
};

async function openLogs(page: Page) {
  await page.route(/\/api\/containers\/[a-f0-9]+\/logs/, async (route) => {
    await route.fulfill({ body: JSON.stringify(logsFixture), contentType: "application/json", status: 200 });
  });
  await page.goto(`http://localhost:3001/containers/${containerId}/logs`);
  await expect(page.getByRole("heading", { name: "api-gateway" })).toBeVisible();
  await expect(page.getByText("INFO service ready on port 8080")).toBeVisible();
}

test("filters logs and exports the visible subset", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLogs(page);

  await page.getByPlaceholder("Search messages").fill("database");
  await expect(page.getByText("ERROR database connection failed")).toBeVisible();
  await expect(page.getByText("INFO service ready on port 8080")).toHaveCount(0);
  await expect(page.getByText("Showing").locator("..")).toContainText("1 of 5");

  await page.getByRole("combobox", { name: "Export" }).selectOption("json");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export visible logs as json" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^api-gateway-.*\.json$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadPath!, "utf8"));
  expect(exported.entries).toHaveLength(1);
  expect(exported.entries[0].message).toBe("ERROR database connection failed");

  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("button", { name: "stderr" }).click();
  await expect(page.getByText("WARN upstream retry scheduled")).toBeVisible();
  await expect(page.getByText("DEBUG health probe completed")).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-container-logs-desktop.png" });
});

test("mobile logs workspace fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLogs(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-container-logs-mobile.png" });
});
