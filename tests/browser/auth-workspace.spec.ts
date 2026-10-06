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
    permissions: ["profile.read", ...(role === "management" ? ["user.read", "role.read"] : [])],
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
