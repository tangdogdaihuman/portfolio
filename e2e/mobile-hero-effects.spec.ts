import { expect, test } from "@playwright/test";

test.describe("手机端首屏背景", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("极光背景已挂载且持续动态", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);

    const canvas = page.locator("canvas.fixed.inset-0");

    if ((await canvas.count()) > 0) {
      await expect(canvas).toBeVisible();
      const sample = () =>
        canvas.evaluate((node) => {
          const el = node as HTMLCanvasElement;
          const ctx = el.getContext("2d");
          if (!ctx || el.width === 0 || el.height === 0) return 0;
          const rows = Math.min(el.height, 200);
          const data = ctx.getImageData(0, 0, el.width, rows).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 401) {
            sum += data[i] + data[i + 1] + data[i + 2];
          }
          return sum;
        });
      const before = await sample();
      await page.waitForTimeout(900);
      const after = await sample();
      expect(after).not.toBe(before);
      return;
    }

    const shell = page.locator(".aurora-shell");
    await expect(shell).toBeVisible();
    const ribbon = page.locator(".aurora-ribbon").first();
    await expect(ribbon).toBeVisible();
    const before = await ribbon.evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(900);
    const after = await ribbon.evaluate((el) => getComputedStyle(el).transform);
    expect(after).not.toBe(before);
  });
});
