import { expect, test } from "@playwright/test";

test.describe("theme toggle", () => {
  test("桌面和移动端切换按钮共享同一主题状态", async ({ page, baseURL }) => {
    await page.goto(baseURL ?? "/");

    const html = page.locator("html");

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopToggle = page.locator("[data-theme-toggle]:visible");

    await desktopToggle.click();
    await expect(html).toHaveClass(/dark/);
    await expect(desktopToggle).toHaveAttribute("aria-pressed", "true");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileToggle = page.locator("[data-theme-toggle]:visible");

    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");

    await mobileToggle.click();
    await expect(html).not.toHaveClass(/dark/);
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "false");

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator("[data-theme-toggle]:visible")).toHaveAttribute("aria-pressed", "false");
  });
});
