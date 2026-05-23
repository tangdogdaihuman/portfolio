import { expect, request, test } from "@playwright/test";

const ADMIN_SECRET = "e2e-admin-secret";
const WORK_IMAGE = "https://placehold.co/1400x1800.png";
const WORK_THUMB = "https://placehold.co/700x900.webp";

let createdWorkId = "";
let createdWorkTitle = "";

async function loginAndCreateWork(baseURL: string) {
  const api = await request.newContext({ baseURL });
  const login = await api.post("/api/auth/login", {
    data: { key: ADMIN_SECRET },
  });
  expect(login.status()).toBe(200);

  createdWorkTitle = `e2e-${Date.now()}`;
  const created = await api.post("/api/works", {
    data: {
      title: createdWorkTitle,
      description: "e2e description",
      tags: ["e2e"],
      imageUrl: WORK_IMAGE,
      thumbUrl: WORK_THUMB,
      pinned: true,
      sortOrder: 999,
      workDate: "2026-05",
      imageSize: 1024,
      sizeWeight: 1.2,
    },
  });
  expect(created.status()).toBe(201);
  const createdBody = await created.json();
  createdWorkId = createdBody.id as string;

  return api;
}

test.beforeAll(async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await loginAndCreateWork(baseURL);
  await api.dispose();
});

test.afterAll(async ({ baseURL }) => {
  if (!baseURL || !createdWorkId) return;
  const api = await request.newContext({ baseURL });
  await api.post("/api/auth/login", { data: { key: ADMIN_SECRET } });
  await api.delete(`/api/works/${createdWorkId}`);
  await api.dispose();
});

test("作品卡片可直接进入详情并可返回首页作品区", async ({ page, baseURL }) => {
  await page.goto("/");
  await page.getByRole("link", { name: createdWorkTitle }).click();
  await expect(page).toHaveURL(new RegExp(`/work/${createdWorkId}$`));

  const backLink = page.getByRole("link", { name: "返回作品集" }).first();
  await backLink.click();
  await expect(page).toHaveURL(/\/#works$/);
  await expect(page.locator("#works")).toBeVisible();

  await page.goto(`${baseURL}/work/${createdWorkId}`);
  await expect(page.getByRole("heading", { name: createdWorkTitle })).toBeVisible();
});

test("详情页支持放大和拖拽大图", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/work/${createdWorkId}`);

  await page.locator("button.cursor-zoom-in").first().click();
  const viewerImage = page.locator(`img[alt="${createdWorkTitle}"]`);
  await expect(viewerImage).toBeVisible();

  await viewerImage.dblclick();
  await expect(viewerImage).toHaveAttribute("style", /scale\(2\)/);

  const box = await viewerImage.boundingBox();
  if (!box) throw new Error("viewer image box not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60);
  await page.mouse.up();

  const style = (await viewerImage.getAttribute("style")) || "";
  expect(style).toContain("translate(");
  expect(style).not.toContain("translate(0px, 0px)");
});

test("作品更新冲突会返回 409 CONFLICT", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await request.newContext({ baseURL });
  await api.post("/api/auth/login", { data: { key: ADMIN_SECRET } });

  const current = await api.get(`/api/works/${createdWorkId}`);
  expect(current.status()).toBe(200);
  const currentBody = await current.json();
  const staleUpdatedAt = currentBody.updated_at as string;

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const firstUpdate = await api.put(`/api/works/${createdWorkId}`, {
    data: { title: `${createdWorkTitle}-fresh`, expectedUpdatedAt: staleUpdatedAt },
  });
  expect(firstUpdate.status()).toBe(200);

  const staleUpdate = await api.put(`/api/works/${createdWorkId}`, {
    data: { title: `${createdWorkTitle}-stale`, expectedUpdatedAt: staleUpdatedAt },
  });
  expect(staleUpdate.status()).toBe(409);
  const staleBody = await staleUpdate.json();
  expect(staleBody.code).toBe("CONFLICT");

  await api.dispose();
});
