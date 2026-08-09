import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { newAdminApi } from "./admin-api";

const TEST_IMAGE_URL = "https://placehold.co/theme-toggle-thumb.png";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

declare global {
  interface Window {
    __heroCanvasResetCount: number;
  }
}

test.describe("theme toggle", () => {
  test("没有本地偏好时默认使用深色主题", async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(baseURL ?? "/");

    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.locator("[data-theme-toggle]:visible").getAttribute("aria-pressed")).toBe("true");
  });

  test("主题样式保留 Tailwind v4 映射并避免 slash opacity 写法", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

    expect(css).toContain("--color-bg: var(--theme-bg);");
    expect(css).toContain("--color-accent: var(--theme-accent);");
    expect(css).not.toContain("rgb(var(--atmosphere) /");
  });

  test("切换主题后作品缩略图保持加载状态", async ({ page, baseURL }) => {
    if (!baseURL) throw new Error("baseURL is required");
    await page.route("https://placehold.co/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TINY_PNG,
      });
    });

    const api = await newAdminApi(baseURL);

    const title = `theme-toggle-image-${Date.now()}`;
    let workId = "";

    try {
      const created = await api.post("/api/works", {
        data: {
          title,
          description: "theme toggle image test",
          tags: ["e2e"],
          imageUrl: TEST_IMAGE_URL,
          thumbUrl: TEST_IMAGE_URL,
          pinned: true,
          sortOrder: 999,
          workDate: "2026-05",
          imageSize: 128,
          sizeWeight: 1,
        },
      });
      expect(created.status()).toBe(201);
      workId = ((await created.json()) as { id: string }).id;

      await page.goto(baseURL ?? "/");
      const thumb = page.getByAltText(title).first();
      await expect.poll(() => thumb.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(thumb).toHaveClass(/opacity-100/);

      await page.locator("[data-theme-toggle]:visible").click();
      await expect.poll(() => thumb.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(thumb).toHaveClass(/opacity-100/);
    } finally {
      if (workId) await api.delete(`/api/works/${workId}`);
      await api.dispose();
    }
  });

  test("切换主题不会重置 Hero canvas", async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "width");
      const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "height");
      if (!widthDescriptor?.get || !widthDescriptor.set || !heightDescriptor?.get || !heightDescriptor.set) return;
      const widthGet = widthDescriptor.get;
      const widthSet = widthDescriptor.set;
      const heightGet = heightDescriptor.get;
      const heightSet = heightDescriptor.set;

      Object.defineProperty(window, "__heroCanvasResetCount", { value: 0, writable: true });

      const isHeroCanvas = (canvas: HTMLCanvasElement) =>
        canvas.classList.contains("fixed") && canvas.classList.contains("inset-0");

      Object.defineProperty(HTMLCanvasElement.prototype, "width", {
        get: widthGet,
        set(value) {
          if (isHeroCanvas(this)) window.__heroCanvasResetCount += 1;
          widthSet.call(this, value);
        },
      });

      Object.defineProperty(HTMLCanvasElement.prototype, "height", {
        get: heightGet,
        set(value) {
          if (isHeroCanvas(this)) window.__heroCanvasResetCount += 1;
          heightSet.call(this, value);
        },
      });
    });

    await page.goto(baseURL ?? "/");
    await expect(page.locator("canvas.fixed.inset-0")).toBeVisible();
    await page.waitForFunction(() => window.__heroCanvasResetCount > 0);

    const beforeToggle = await page.evaluate(() => window.__heroCanvasResetCount);
    await page.locator("[data-theme-toggle]:visible").click();
    await page.waitForTimeout(120);

    expect(await page.evaluate(() => window.__heroCanvasResetCount)).toBe(beforeToggle);
  });

  test("作品详情页切换主题后图标保持可见", async ({ page, baseURL }) => {
    if (!baseURL) throw new Error("baseURL is required");
    await page.route("https://placehold.co/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TINY_PNG,
      });
    });

    const api = await newAdminApi(baseURL);

    const title = `theme-toggle-icon-${Date.now()}`;
    let workId = "";

    try {
      const created = await api.post("/api/works", {
        data: {
          title,
          description: "theme toggle icon test",
          tags: ["e2e"],
          imageUrl: TEST_IMAGE_URL,
          thumbUrl: TEST_IMAGE_URL,
          pinned: false,
          sortOrder: 998,
          workDate: "2026-05",
          imageSize: 128,
          sizeWeight: 1,
        },
      });
      expect(created.status()).toBe(201);
      workId = ((await created.json()) as { id: string }).id;

      await page.goto(`${baseURL}/work/${workId}`);
      const toggle = page.locator("[data-theme-toggle]:visible");
      await expect(toggle).toBeVisible();

      const iconOpacities = () =>
        toggle
          .locator("svg")
          .evaluateAll((icons) => icons.map((icon) => getComputedStyle(icon).opacity));

      await expect.poll(iconOpacities).toContain("1");

      await toggle.click();
      await expect(page.locator("html")).toHaveClass(/light/);
      await expect.poll(iconOpacities).toContain("1");

      await toggle.click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expect.poll(iconOpacities).toContain("1");
    } finally {
      if (workId) await api.delete(`/api/works/${workId}`);
      await api.dispose();
    }
  });

  test("桌面和移动端切换按钮共享同一主题状态", async ({ page, baseURL }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto(baseURL ?? "/");

    const html = page.locator("html");

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopToggle = page.locator("[data-theme-toggle]:visible");

    await desktopToggle.click();
    await expect(html).toHaveClass(/dark/);
    await expect(html).not.toHaveClass(/light/);
    await expect(desktopToggle).toHaveAttribute("aria-pressed", "true");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileToggle = page.locator("[data-theme-toggle]:visible");

    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");

    await mobileToggle.click();
    await expect(html).not.toHaveClass(/dark/);
    await expect(html).toHaveClass(/light/);
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "false");

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator("[data-theme-toggle]:visible")).toHaveAttribute("aria-pressed", "false");
  });
});
