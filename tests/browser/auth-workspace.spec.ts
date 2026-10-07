import { expect, test, type Page } from "@playwright/test";

// UI acceptance uses explicit transport fixtures. Real API/SQL acceptance is separate.
function principal(role = "engineer") {
  return {
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      identityId: "20000000-0000-4000-8000-000000000001",
      email: "browser-fixture@example.invalid",
      displayName: "Browser fixture",
      status: "active",
      employeeCode: null,
      jobTitle: null,
      phone: null,
      lastLoginAt: null,
    },
    roles: [role],
    permissions: [
      "profile.read",
      "notification.read",
      ...(role === "management" ? ["user.read", "role.read"] : []),
      ...(role === "super_admin"
        ? [
            "user.read",
            "role.read",
            "admin.users",
            "admin.roles",
            "user.create",
            "user.update",
            "user.disable",
          ]
        : []),
    ],
  };
}

async function fixture(page: Page, role = "engineer") {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") {
      await route.fulfill({ json: principal(role) });
    } else if (url.pathname === "/api/admin/users") {
      const user = principal(role).user;
      await route.fulfill({
        json: {
          items: [
            {
              ...user,
              display_name: user.displayName,
              employee_code: null,
              job_title: null,
              phone: null,
              roles: [role],
            },
          ],
          page: 1,
          pageSize: 25,
          total: 1,
        },
      });
    } else if (url.pathname === "/api/admin/roles") {
      await route.fulfill({
        json: {
          items: [
            {
              code: role,
              name: role,
              active: true,
              permissions: ["profile.read"],
              allowedPermissions: ["profile.read"],
            },
          ],
          permissions: [{ code: "profile.read" }],
        },
      });
    } else if (url.pathname === "/api/auth/logout") {
      await route.fulfill({ status: 204 });
    } else {
      await route.fulfill({ status: 503, json: { error: { code: "FIXTURE_UNAVAILABLE" } } });
    }
  });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test("login preserves input on a generic failure, disables while pending and reaches the workspace", async ({
  page,
}) => {
  await fixture(page);
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const submitted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/auth/login", async (route) => {
    started?.();
    await waiting;
    await route.fulfill({ status: 401, json: { error: { code: "AUTHENTICATION_FAILED" } } });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("browser-fixture@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("browser-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await submitted;
  await expect(page.getByRole("button", { name: "Please wait…" })).toBeDisabled();
  release?.();
  await expect(
    page.getByText("Sign-in failed or your session has expired.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "browser-fixture@example.invalid",
  );
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({ json: principal() });
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "My workspace", exact: true })).toBeVisible();
  await noOverflow(page);
});

test("reset request is generic and invalid or expired reset credentials expose no password form", async ({
  page,
}) => {
  await page.route("**/api/auth/password-reset/request", async (route) => {
    await route.fulfill({
      status: 202,
      json: { message: "If the account exists, password reset instructions will be sent." },
    });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill("unknown@example.invalid");
  await page.getByRole("button", { name: "Send reset instructions" }).click();
  await expect(
    page.getByText(
      "If your account exists, instructions will arrive by email. Open the link in this browser.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.route("**/api/auth/recovery/status", async (route) => {
    await route.fulfill({ status: 400, json: {} });
  });
  await page.goto("/auth/reset-password");
  await expect(
    page.getByText("This reset link is invalid or has expired. Request a new link.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await noOverflow(page);
});

test("verified reset form rejects mismatch, saves matching passwords and returns to sign-in", async ({
  page,
}) => {
  await page.route("**/api/auth/recovery/status", async (route) => {
    await route.fulfill({ json: { ready: true } });
  });
  await page.route("**/api/auth/password-reset/complete", async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.goto("/auth/reset-password");
  await page.getByLabel("Password", { exact: true }).fill("browser-new-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("browser-different-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("The passwords do not match.", { exact: true })).toBeVisible();
  await page.getByLabel("Confirm password", { exact: true }).fill("browser-new-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByText("Your password was saved. Sign in with the new password.", { exact: true }),
  ).toBeVisible();
});

test("callback removes credential query parameters before exchange and handles invalid links", async ({
  page,
}) => {
  await page.route("**/api/auth/invitation/session", async (route) => {
    await route.fulfill({ status: 400, json: {} });
  });
  await page.route("**/api/auth/recovery/complete", async (route) => {
    await route.fulfill({ status: 400, json: {} });
  });
  await page.goto("/auth/callback?code=fixture-recovery-code");
  await expect(page).toHaveURL(/\/auth\/callback$/);
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  await page.goto("/auth/callback?error=expired");
  await expect(
    page.getByText("This link is invalid or has expired. Request a new link.", { exact: true }),
  ).toBeVisible();
  await page.goto(
    "/auth/callback#type=recovery&access_token=fixture-recovery-token&refresh_token=fixture-unused-refresh",
  );
  await expect(page).toHaveURL(/\/auth\/callback$/);
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});

test("workspace switches sidebar to bottom navigation and hides unrelated administration for engineers", async ({
  page,
}, testInfo) => {
  await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "My workspace", exact: true })).toBeVisible();
  const mobile = (page.viewportSize()?.width ?? 0) < 640;
  await expect(page.getByRole("navigation", { name: "Mobile workspace navigation" })).toBeVisible({
    visible: mobile,
  });
  await expect(
    page.getByRole("navigation", { name: "Workspace navigation", exact: true }),
  ).toBeVisible({ visible: !mobile });
  await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Roles", exact: true })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("workspace.png"), fullPage: true });
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test("Management user and role pages retain read-only controls and mobile card presentation", async ({
  page,
}, testInfo) => {
  await fixture(page, "management");
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  const filteredRequest = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get("status") === "disabled",
  );
  await page.getByLabel("Account status", { exact: true }).selectOption("disabled");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await filteredRequest;
  await expect(
    page.getByText("browser-fixture@example.invalid").filter({ visible: true }),
  ).toBeVisible();
  for (const name of ["Invite user", "Edit", "Disable"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("users.png"), fullPage: true });
  await page.goto("/admin/roles");
  await expect(page.getByRole("heading", { name: "Roles and permissions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage grants" })).toHaveCount(0);
  await noOverflow(page);
});

test("workspace handles provider errors, retry and anonymous redirect", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.goto("/workspace");
  await expect(
    page.getByText("The service is temporarily unavailable. Try again shortly.", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 401, json: {} });
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("account, workspace search and lazy notifications respect the current account", async ({
  page,
}) => {
  await fixture(page);
  let calls = 0;
  let read = false;
  await page.route("**/api/notifications**", async (route) => {
    calls++;
    if (route.request().method() === "POST") {
      read = true;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      json: {
        items: [
          {
            id: "30000000-0000-4000-8000-000000000001",
            title: "Site access update",
            message: "Use the service entrance",
            read_at: read ? "2026-10-07T12:00:00Z" : null,
            created_at: "2026-10-07T11:00:00Z",
          },
        ],
        hasMore: false,
        page: 1,
      },
    });
  });
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "My workspace", exact: true })).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const account = page.getByRole("dialog", { name: "Your account" });
  await expect(account.getByText("browser-fixture@example.invalid")).toBeVisible();
  await expect(account.getByRole("link", { name: "Reset password" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  await account.getByRole("button", { name: "Close Your account" }).click();
  await page.getByRole("button", { name: "Search workspace", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Search workspace" });
  await search.getByLabel("Find a page").fill("Users");
  await expect(search.getByText("No accessible pages match")).toBeVisible();
  await expect(search.getByRole("link", { name: "Users" })).toHaveCount(0);
  await search.getByLabel("Find a page").fill("workspace");
  await search.getByRole("link", { name: "My workspace" }).click();
  await expect(search).not.toBeVisible();
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  const notifications = page.getByRole("dialog", { name: "Notifications" });
  await expect(notifications.getByText("Site access update")).toBeVisible();
  await notifications.getByRole("button", { name: "Mark as read" }).click();
  await expect(notifications.getByText("Read", { exact: true })).toBeVisible();
  await notifications.getByRole("button", { name: "Close Notifications" }).click();
  await noOverflow(page);
});

test("Super Admin can resend an invitation without refetching the role catalog", async ({
  page,
}) => {
  await fixture(page, "super_admin");
  let catalogCalls = 0;
  let resends = 0;
  await page.route("**/api/admin/roles", async (route) => {
    catalogCalls++;
    await route.fulfill({
      json: {
        items: [
          {
            code: "engineer",
            name: "Engineer",
            active: true,
            permissions: ["profile.read"],
            allowedPermissions: ["profile.read"],
          },
        ],
        permissions: [{ code: "profile.read" }],
      },
    });
  });
  await page.route("**/api/admin/users?**", async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            email: "invited@example.invalid",
            display_name: "Invited colleague",
            employee_code: null,
            job_title: null,
            phone: null,
            status: "invited",
            roles: ["engineer"],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
    });
  });
  await page.route("**/api/admin/users/*/invite", async (route) => {
    resends++;
    await route.fulfill({ status: 202, json: { message: "Invitation resend requested." } });
  });
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Edit", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Resend invitation", exact: true }).click();
  await expect(
    page.getByText("Invitation resend requested. Previous setup sessions were revoked."),
  ).toBeVisible();
  expect(resends).toBe(1);
  expect(catalogCalls).toBe(1);
  await noOverflow(page);
});

test("role activation uses an explicit confirmed server action", async ({ page }) => {
  await fixture(page, "super_admin");
  let active = true;
  await page.route("**/api/admin/roles", async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            code: "engineer",
            name: "Engineer",
            active,
            permissions: ["profile.read"],
            allowedPermissions: ["profile.read"],
          },
        ],
        permissions: [{ code: "profile.read" }],
      },
    });
  });
  await page.route("**/api/admin/roles/engineer/*", async (route) => {
    active = new URL(route.request().url()).pathname.endsWith("/enable");
    await route.fulfill({ status: 204 });
  });
  await page.goto("/admin/roles");
  await page
    .getByRole("button", { name: "Deactivate role", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Confirm role change" }).click();
  await expect(page.getByText("Disabled", { exact: true }).filter({ visible: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Activate role", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Confirm role change" }).click();
  await expect(page.getByText("Active", { exact: true }).filter({ visible: true })).toBeVisible();
  await noOverflow(page);
});

test("a reset session expiring during submission removes password inputs and offers a new link", async ({
  page,
}) => {
  await page.route("**/api/auth/recovery/status", async (route) => {
    await route.fulfill({ json: { ready: true } });
  });
  await page.route("**/api/auth/password-reset/complete", async (route) => {
    await route.fulfill({ status: 400, json: {} });
  });
  await page.goto("/auth/reset-password");
  await page.getByLabel("Password", { exact: true }).fill("fixture-expiring-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("fixture-expiring-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByText("This reset link is invalid or has expired. Request a new link.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});
