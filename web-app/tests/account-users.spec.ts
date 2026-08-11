import { expect, test, type Page } from "@playwright/test";

const now = Math.floor(Date.now() / 1000);
const currentUser = {
  created_at: now - 86_400,
  created_by: "environment",
  current_user: true,
  display_name: "Simon Kosgei",
  email: "a3slabs@gmail.com",
  minimum_role: "admin",
  role: "admin",
  source: "environment",
  status: "active",
  timezone: "Africa/Nairobi",
  title: "Infrastructure administrator",
  updated_at: now - 3_600,
  updated_by: "a3slabs@gmail.com",
} as const;

const operator = {
  created_at: now - 43_200,
  created_by: "a3slabs@gmail.com",
  current_user: false,
  display_name: "Operations User",
  email: "ops@a3slabs.co.ke",
  minimum_role: null,
  role: "operator",
  source: "managed",
  status: "active",
  timezone: "UTC",
  title: "On-call engineer",
  updated_at: now - 1_800,
  updated_by: "a3slabs@gmail.com",
} as const;

async function mockSession(page: Page) {
  await page.route(/\/api\/session$/, (route) => route.fulfill({
    body: JSON.stringify({ display_name: currentUser.display_name, email: currentUser.email, expires_at: now + 3600, issued_at: now - 600, role: "admin", role_source: "environment", status: "active", title: currentUser.title }),
    contentType: "application/json",
  }));
}

test("profile management updates personal details and exposes session controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSession(page);
  let savedName = "";
  await page.route(/\/api\/profile$/, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { display_name: string; timezone: string; title: string };
      savedName = body.display_name;
      await route.fulfill({ body: JSON.stringify({ profile: { ...currentUser, ...body } }), contentType: "application/json" });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ profile: currentUser, session: { expires_at: now + 3600, identity_provider: "Cloudflare Access", issued_at: now - 600, subject: "identity-1" } }), contentType: "application/json" });
  });

  await page.goto("http://localhost:3001/account");
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
  await expect(page.locator(".workspace-page-header")).toBeVisible();
  await expect(page.locator(".workspace-panel")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveClass(/active/);
  await page.getByLabel("Display name").fill("Simon K.");
  await page.getByLabel("Timezone").selectOption("UTC");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect.poll(() => savedName).toBe("Simon K.");
  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "End session" })).toHaveAttribute("href", "/logout");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-account-desktop.png" });
});

test("administrators can filter, create, and edit managed users", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 940 });
  await mockSession(page);
  let users = [currentUser, operator] as Array<typeof currentUser | typeof operator | Record<string, unknown>>;
  let updatedRole = "";
  await page.route(/\/api\/users(?:\/.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET") {
      await route.fulfill({ body: JSON.stringify({ current_user: currentUser.email, summary: { active: 2, admins: 1, suspended: 0, total: 2 }, users }), contentType: "application/json" });
      return;
    }
    if (url.pathname === "/api/users") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const user = { ...body, created_at: now, created_by: currentUser.email, current_user: false, minimum_role: null, source: "managed", updated_at: now, updated_by: currentUser.email };
      users = [...users, user];
      await route.fulfill({ body: JSON.stringify({ user }), contentType: "application/json", status: 201 });
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    updatedRole = String(body.role);
    const user = { ...operator, ...body, updated_at: now };
    users = users.map((entry) => entry.email === operator.email ? user : entry);
    await route.fulfill({ body: JSON.stringify({ user }), contentType: "application/json" });
  });

  await page.goto("http://localhost:3001/users");
  await expect(page.getByRole("heading", { name: "User management" })).toBeVisible();
  await expect(page.locator(".workspace-page-header")).toBeVisible();
  await expect(page.locator(".workspace-summary")).toBeVisible();
  await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveClass(/active/);
  await page.getByPlaceholder("Search users").fill("operations");
  await expect(page.getByText("ops@a3slabs.co.ke")).toBeVisible();
  await page.getByText("ops@a3slabs.co.ke").click();
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("admin");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => updatedRole).toBe("admin");

  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Email address").fill("viewer@a3slabs.co.ke");
  await page.getByLabel("Display name").last().fill("Read Only User");
  await page.getByRole("dialog").getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText("User added to the directory")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ fullPage: true, path: "/tmp/a3s-users-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Users", exact: true })).toBeVisible();
  await page.screenshot({ fullPage: false, path: "/tmp/a3s-users-mobile-nav.png" });
});
