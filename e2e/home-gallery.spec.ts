import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { newAdminApi } from "./admin-api";

const WORK_IMAGE = "https://placehold.co/1400x1800.png";
const WORK_THUMB = "https://placehold.co/700x900.webp";

const runId = `${Date.now()}`;
const tagX = `gallery-x-${runId}`;
const tagY = `gallery-y-${runId}`;
const titleA = `gallery-a-${runId}`;
const titleB = `gallery-b-${runId}`;
const titleC = `gallery-c-${runId}`;
const ownTitles = [titleA, titleB, titleC];

const createdIds: string[] = [];

async function createGalleryWork(
  api: APIRequestContext,
  title: string,
  tags: string[],
  workDate: string,
  sortOrder: number
) {
  const created = await api.post("/api/works", {
    data: {
      title,
      description: "gallery e2e",
      tags,
      imageUrl: WORK_IMAGE,
      thumbUrl: WORK_THUMB,
      pinned: false,
      sortOrder,
      workDate,
      imageSize: 1024,
      sizeWeight: 1,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const body = await created.json();
  createdIds.push(body.id as string);
}

async function ownTitlesInOrder(page: Page) {
  const labels = await page
    .locator('#works a[href^="/work/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("aria-label") ?? ""));
  return labels.filter((label) => ownTitles.includes(label));
}

function tagButton(page: Page, tag: string) {
  return page.locator("#works").getByRole("button", { name: tag, exact: true });
}

function sortButton(page: Page, label: string) {
  return page.locator("#works").getByRole("button", { name: label, exact: true });
}

test.beforeAll(async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  await createGalleryWork(api, titleA, [tagX], "2026-01", 10);
  await createGalleryWork(api, titleB, [tagX, tagY], "2026-06", 20);
  await createGalleryWork(api, titleC, [tagX, tagY], "2026-03", 30);
  await api.dispose();
});

test.afterAll(async ({ baseURL }) => {
  if (!baseURL || createdIds.length === 0) return;
  const api = await newAdminApi(baseURL);
  for (const id of createdIds) {
    await api.delete(`/api/works/${id}`);
  }
  await api.dispose();
});

test("首页标签筛选只展示匹配作品且可还原", async ({ page }) => {
  await page.goto("/");

  await tagButton(page, tagX).click();
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleC, titleB, titleA]);

  await tagButton(page, tagY).click();
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleC, titleB]);

  await tagButton(page, "全部").click();
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleC, titleB, titleA]);
});

test("首页排序按作品日期重排列表", async ({ page }) => {
  await page.goto("/");

  await tagButton(page, tagX).click();
  await expect(sortButton(page, "精选")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleC, titleB, titleA]);

  await sortButton(page, "最新").click();
  await expect(sortButton(page, "最新")).toHaveAttribute("aria-pressed", "true");
  await expect(sortButton(page, "精选")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleB, titleC, titleA]);

  await sortButton(page, "最早").click();
  await expect(sortButton(page, "最早")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleA, titleC, titleB]);
});

test("首页筛选与排序可以叠加生效", async ({ page }) => {
  await page.goto("/");

  await tagButton(page, tagY).click();
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleC, titleB]);

  await sortButton(page, "最新").click();
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleB, titleC]);

  await tagButton(page, "全部").click();
  await expect.poll(() => ownTitlesInOrder(page)).toEqual([titleB, titleC, titleA]);
});
