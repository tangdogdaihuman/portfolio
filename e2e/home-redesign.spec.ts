import { expect, test, type APIRequestContext } from "@playwright/test";
import { newAdminApi } from "./admin-api";

const runId = `${Date.now()}`;
const title = `redesign-wall-${runId}`;
let createdId = "";

async function createWallWork(api: APIRequestContext) {
  const created = await api.post("/api/works", {
    data: {
      title,
      description: "redesign wall e2e",
      tags: [`wall-${runId}`],
      imageUrl: "https://placehold.co/1400x1800.png",
      thumbUrl: "https://placehold.co/700x900.webp",
      pinned: false,
      sortOrder: 1,
      workDate: "2026-01",
      imageSize: 1024,
      sizeWeight: 1,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  createdId = (await created.json()).id as string;
}

test.beforeAll(async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  await createWallWork(api);
  await api.dispose();
});

test.afterAll(async ({ baseURL }) => {
  if (!baseURL || !createdId) return;
  const api = await newAdminApi(baseURL);
  await api.delete(`/api/works/${createdId}`);
  await api.dispose();
});

test("桌面首屏渲染作品墙且首页无背景模糊层", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".wall-stage")).toBeVisible();
  await expect.poll(() => page.locator(".wall-stage img").count()).toBeGreaterThan(10);
  const blurred = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].filter((el) => {
      const style = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
      return (
        (style.backdropFilter && style.backdropFilter !== "none") ||
        (style.webkitBackdropFilter && style.webkitBackdropFilter !== "none")
      );
    }).length
  );
  expect(blurred).toBe(0);
});

test("触屏设备不挂载远层作品墙", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".wall-stage")).toBeVisible();
  await expect(page.locator(".wall-layer-far")).toHaveCount(0);
  await context.close();
});

test("reduced motion 下墙漂移与滚动变换静止", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".wall-stage")).toBeVisible();
  const drift = await page.locator(".wall-drift").first().evaluate((el) => getComputedStyle(el).animationName);
  expect(drift).toBe("none");
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(900);
  const transforms = await page.locator(".wall-stage > div").evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transform));
  for (const transform of transforms) {
    expect(transform === "" || transform === "none").toBe(true);
  }
  await context.close();
});