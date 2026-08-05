import { expect, test } from "@playwright/test";

async function getCursorPosition(page: import("@playwright/test").Page, selector: ".bead-cursor" | ".bead-ring") {
  return page.locator(selector).evaluate((node) => {
    const element = node as HTMLElement;
    const match = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(element.style.transform || "");
    return {
      left: match ? Number.parseFloat(match[1]) : 0,
      top: match ? Number.parseFloat(match[2]) : 0,
    };
  });
}

async function getCursorOpacity(page: import("@playwright/test").Page, selector: ".bead-cursor" | ".bead-ring") {
  return page.locator(selector).evaluate((node) => {
    const element = node as HTMLElement;
    return Number.parseFloat(window.getComputedStyle(element).opacity);
  });
}

async function moveUntilCursorVisible(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
  minOpacity = 0.8
) {
  await expect.poll(async () => {
    await page.mouse.move(x, y, { steps: 5 });
    await page.waitForTimeout(120);
    return getCursorOpacity(page, ".bead-ring");
  }, { timeout: 5000 }).toBeGreaterThan(minOpacity);
}

test.describe("桌面端自定义光标", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("滚动到下方后光晕仍然跟随鼠标", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);

    const ring = page.locator(".bead-ring");
    await expect(ring).toBeAttached();

    await moveUntilCursorVisible(page, 280, 220);

    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(250);
    await moveUntilCursorVisible(page, 1140, 760);
    await page.waitForTimeout(500);

    const afterScroll = await getCursorPosition(page, ".bead-ring");
    expect(Math.abs(afterScroll.left - 1140)).toBeLessThan(60);
    expect(Math.abs(afterScroll.top - 760)).toBeLessThan(60);
  });

  test("滚动页面时不会把旧光晕钉在屏幕上", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);

    const ring = page.locator(".bead-ring");
    await expect(ring).toBeAttached();

    await moveUntilCursorVisible(page, 420, 260);

    await page.mouse.wheel(0, 1800);
    await expect.poll(async () => getCursorOpacity(page, ".bead-ring"), { timeout: 2000 }).toBeLessThan(0.65);

    await moveUntilCursorVisible(page, 980, 620, 0.9);
    await page.waitForTimeout(500);

    const position = await getCursorPosition(page, ".bead-ring");
    expect(Math.abs(position.left - 980)).toBeLessThan(70);
    expect(Math.abs(position.top - 620)).toBeLessThan(70);
  });
});
