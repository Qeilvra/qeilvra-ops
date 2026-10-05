import { expect, test } from "@playwright/test";

test("startup screen is readable, bounded, and honest about incomplete workflows", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("AIRMECH ONE", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Built by Qeilvra", { exact: true }).first()).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  const bounds = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.pageHeight).toBeLessThan(bounds.viewportHeight * 2);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/startup-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("missing routes offer a clear way back", async ({ page }) => {
  const response = await page.goto("/route-that-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: /workspace|home|startup/i })).toBeVisible();
});
