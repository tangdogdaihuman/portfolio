import { expect, test, type Page } from "@playwright/test";

test.describe("手机端首屏背景", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function sampleAurora(page: Page) {
    const canvas = page.locator("canvas.fixed.inset-0");
    if ((await canvas.count()) > 0) {
      return canvas.evaluate((node) => {
        const el = node as HTMLCanvasElement;
        if (el.dataset.auroraFrame !== undefined) return `f${el.dataset.auroraFrame}`;
        let ctx: CanvasRenderingContext2D | null = null;
        try {
          ctx = el.getContext("2d");
        } catch {
          return "static";
        }
        if (!ctx || el.width === 0 || el.height === 0) return "static";
        const rows = Math.min(el.height, 200);
        const data = ctx.getImageData(0, 0, el.width, rows).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 401) {
          sum += data[i] + data[i + 1] + data[i + 2];
        }
        return `p${sum}`;
      });
    }
    const ribbon = page.locator(".aurora-ribbon").first();
    return ribbon.evaluate((el) => getComputedStyle(el).transform);
  }

  test("极光背景已挂载且持续动态", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);

    const canvas = page.locator("canvas.fixed.inset-0");
    if ((await canvas.count()) > 0) {
      await expect(canvas).toBeVisible();
    } else {
      await expect(page.locator(".aurora-shell")).toBeVisible();
      await expect(page.locator(".aurora-ribbon").first()).toBeVisible();
    }

    const before = await sampleAurora(page);
    await page.waitForTimeout(1600);
    const after = await sampleAurora(page);
    expect(after).not.toBe(before);
  });

  test("滚动期间极光保持动态", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);
    await page.waitForTimeout(1200);

    const before = await sampleAurora(page);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 140);
      await page.waitForTimeout(120);
    }
    const during = await sampleAurora(page);
    expect(during).not.toBe(before);
  });
});