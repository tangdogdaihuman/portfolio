import { expect, test } from "@playwright/test";

async function getCursorPosition(page: import("@playwright/test").Page, selector: ".cursor" | ".cursor-ring") {
  return page.locator(selector).evaluate((node) => {
    const element = node as HTMLElement;
    return {
      left: Number.parseFloat(element.style.left || "0"),
      top: Number.parseFloat(element.style.top || "0"),
    };
  });
}

async function getCursorOpacity(page: import("@playwright/test").Page, selector: ".cursor" | ".cursor-ring") {
  return page.locator(selector).evaluate((node) => {
    const element = node as HTMLElement;
    return Number.parseFloat(window.getComputedStyle(element).opacity);
  });
}

test.describe("桌面端自定义光标", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("滚动到下方后光晕仍然跟随鼠标", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);

    const ring = page.locator(".cursor-ring");
    await expect(ring).toBeVisible();

    await page.mouse.move(280, 220);
    await page.waitForTimeout(900);

    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(250);
    await page.mouse.move(1140, 760);
    await page.waitForTimeout(200);

    const afterScroll = await getCursorPosition(page, ".cursor-ring");
    expect(Math.abs(afterScroll.left - 1140)).toBeLessThan(60);
    expect(Math.abs(afterScroll.top - 760)).toBeLessThan(60);
  });

  test("滚动页面时不会把旧光晕钉在屏幕上", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);

    const ring = page.locator(".cursor-ring");
    await expect(ring).toBeVisible();

    await page.mouse.move(420, 260);
    await page.waitForTimeout(200);
    expect(await getCursorOpacity(page, ".cursor-ring")).toBeGreaterThan(0.8);

    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(220);
    expect(await getCursorOpacity(page, ".cursor-ring")).toBeLessThan(0.65);

    await page.mouse.move(980, 620);
    await page.waitForTimeout(180);
    expect(await getCursorOpacity(page, ".cursor-ring")).toBeGreaterThan(0.9);

    const position = await getCursorPosition(page, ".cursor-ring");
    expect(Math.abs(position.left - 980)).toBeLessThan(70);
    expect(Math.abs(position.top - 620)).toBeLessThan(70);
  });
});
