import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/ui-preview");
});

test("shared fields validate, associate errors and support touch-sized controls", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: "Shared component verification" })).toBeVisible();
  const invalid = page.getByLabel("Invalid specimen");
  await expect(invalid).toHaveAttribute("aria-invalid", "true");
  await expect(invalid).toHaveAttribute("aria-describedby", "sample-error-error");
  await page.getByRole("button", { name: "Validate specimen" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByLabel("Sample name", { exact: true }).fill("Keyboard verification");
  await page.getByLabel("Sample selection").selectOption("Option B");
  await page.getByLabel("Sample date").fill("2026-10-05");
  await page.getByLabel("Sample notes").fill("No business record is created.");
  await page.getByLabel("Enable specimen option").check();
  await page.getByRole("button", { name: "Validate specimen" }).click();
  await expect(page.getByRole("status")).toHaveText("Specimen validated locally; no data saved.");
  await expect(page.getByRole("button", { name: "Busy specimen" })).toBeDisabled();
  if (test.info().project.name === "mobile") {
    const size = await page.getByLabel("Sample name", { exact: true }).boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
  }
});

test("tabs support arrow keys and a bounded record page uses mobile cards", async ({ page }) => {
  await page.getByRole("tab", { name: "Controls" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Records" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Records" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  const mobile = test.info().project.name === "mobile";
  await expect(page.locator(".ui-records__mobile")).toBeVisible({ visible: mobile });
  await expect(page.getByRole("table")).toHaveCount(mobile ? 0 : 1);
  await expect(
    page.getByText("Component specimen B", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.width);
});

test("dialogs contain focus, close with Escape and restore the trigger", async ({ page }) => {
  for (const kind of ["modal", "drawer", "sheet"]) {
    const trigger = page.getByRole("button", { name: `Open ${kind}` });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: `${kind[0]?.toUpperCase()}${kind.slice(1)} specimen`,
    });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("loading, empty and safe error states are explicit", async ({ page }) => {
  await page.getByRole("tab", { name: "States" }).click();
  await expect(page.getByRole("heading", { name: "No component records" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Safe error-state specimen" })).toHaveText(
    /Safe error-state specimen/,
  );
  await expect(page.getByRole("status", { name: "Loading specimen" })).toBeVisible();
  await page.screenshot({
    path: `test-results/shared-ui-${test.info().project.name}.png`,
    fullPage: true,
  });
});
