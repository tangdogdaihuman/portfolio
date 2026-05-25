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
});
