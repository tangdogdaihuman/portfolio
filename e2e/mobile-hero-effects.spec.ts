import { expect, test } from "@playwright/test";

async function sampleCanvasIntensity(page: import("@playwright/test").Page, x: number, y: number, radius = 2) {
  return page.locator("canvas.fixed.inset-0").evaluate((canvas, sample) => {
    const element = canvas as HTMLCanvasElement;
    const ctx = element.getContext("2d");
    if (!ctx) throw new Error("background canvas context not found");

    const rect = element.getBoundingClientRect();
    const scaleX = rect.width > 0 ? element.width / rect.width : 1;
    const scaleY = rect.height > 0 ? element.height / rect.height : 1;
    const centerX = Math.round((sample.x - rect.left) * scaleX);
    const centerY = Math.round((sample.y - rect.top) * scaleY);
    const startX = Math.max(0, centerX - sample.radius);
    const startY = Math.max(0, centerY - sample.radius);
    const endX = Math.min(element.width, centerX + sample.radius + 1);
    const endY = Math.min(element.height, centerY + sample.radius + 1);
    const width = Math.max(1, endX - startX);
    const height = Math.max(1, endY - startY);
    const pixels = ctx.getImageData(startX, startY, width, height).data;

    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      total += pixels[i] + pixels[i + 1] + pixels[i + 2] + pixels[i + 3];
    }

    return total / (pixels.length / 4);
  }, { x, y, radius });
}

async function sampleCanvasSignature(page: import("@playwright/test").Page, points: Array<{ x: number; y: number }>) {
  const values: number[] = [];
  for (const point of points) {
    values.push(await sampleCanvasIntensity(page, point.x, point.y));
  }
  return values;
}

function getSignatureDelta(a: number[], b: number[]) {
  return a.reduce((sum, value, index) => sum + Math.abs(value - (b[index] ?? 0)), 0);
}

test.describe("手机端首屏背景交互", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("空闲时不持续重绘，点按波纹主要落在触点附近", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);

    const hero = page.locator(".hero-noise");
    await expect(hero).toBeVisible();

    const heroBox = await hero.boundingBox();
    if (!heroBox) throw new Error("hero box not found");

    const idlePoints = [
      { x: heroBox.x + heroBox.width * 0.18, y: heroBox.y + heroBox.height * 0.24 },
      { x: heroBox.x + heroBox.width * 0.42, y: heroBox.y + heroBox.height * 0.3 },
      { x: heroBox.x + heroBox.width * 0.68, y: heroBox.y + heroBox.height * 0.26 },
      { x: heroBox.x + heroBox.width * 0.3, y: heroBox.y + heroBox.height * 0.54 },
      { x: heroBox.x + heroBox.width * 0.6, y: heroBox.y + heroBox.height * 0.5 },
    ];

    const idleBefore = await sampleCanvasSignature(page, idlePoints);
    await page.waitForTimeout(700);
    const idleAfter = await sampleCanvasSignature(page, idlePoints);
    expect(getSignatureDelta(idleBefore, idleAfter)).toBeLessThan(10);

    const tapX = heroBox.x + heroBox.width * 0.2;
    const tapY = heroBox.y + heroBox.height * 0.36;
    const farX = tapX + 190;
    const nearBefore = await sampleCanvasIntensity(page, tapX, tapY);
    const farBefore = await sampleCanvasIntensity(page, farX, tapY);

    await page.touchscreen.tap(tapX, tapY);
    await page.waitForTimeout(60);

    const nearAfter = await sampleCanvasIntensity(page, tapX, tapY);
    const farAfter = await sampleCanvasIntensity(page, farX, tapY);
    const nearDelta = Math.abs(nearAfter - nearBefore);
    const farDelta = Math.abs(farAfter - farBefore);

    expect(nearDelta).toBeGreaterThan(farDelta + 10);
  });
});
