import { expect, request, test, type APIRequestContext, type Page, type Response } from "@playwright/test";
import { createClient } from "@libsql/client";
import { ADMIN_SECRET, newAdminApi, toAdminBaseURL } from "./admin-api";

const WORK_IMAGE = "https://placehold.co/1400x1800.png";
const WORK_THUMB = "https://placehold.co/700x900.webp";
const GALLERY_IMAGES = [
  { imageUrl: "https://placehold.co/1400x1800/101010/f5f1e8.png?text=1", thumbUrl: "https://placehold.co/700x900/101010/f5f1e8.webp?text=1" },
  { imageUrl: "https://placehold.co/1400x1800/1a2435/f5f1e8.png?text=2", thumbUrl: "https://placehold.co/700x900/1a2435/f5f1e8.webp?text=2" },
  { imageUrl: "https://placehold.co/1400x1800/352018/f5f1e8.png?text=3", thumbUrl: "https://placehold.co/700x900/352018/f5f1e8.webp?text=3" },
];

let createdWorkId = "";
let createdWorkTitle = "";

async function loginAndCreateWork(baseURL: string) {
  const api = await newAdminApi(baseURL);

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

  const imagesRes = await api.post(`/api/works/${createdWorkId}/images`, {
    data: GALLERY_IMAGES.map((image, index) => ({
      imageUrl: image.imageUrl,
      thumbUrl: image.thumbUrl,
      imageSize: 1024 + index,
      sortOrder: index,
    })),
  });
  expect(imagesRes.status()).toBe(201);

  return api;
}

async function createApiWork(
  api: APIRequestContext,
  title: string,
  sortOrder: number,
  options: {
    cover?: { imageUrl: string; thumbUrl: string };
    pinned?: boolean;
  } = {}
) {
  const cover = options.cover ?? { imageUrl: WORK_IMAGE, thumbUrl: WORK_THUMB };
  const created = await api.post("/api/works", {
    data: {
      title,
      description: "e2e description",
      tags: ["e2e"],
      imageUrl: cover.imageUrl,
      thumbUrl: cover.thumbUrl,
      pinned: options.pinned ?? false,
      sortOrder,
      workDate: "2026-05",
      imageSize: 1024,
      sizeWeight: 1,
    },
  });
  expect(created.status()).toBe(201);
  const createdBody = await created.json();
  return createdBody.id as string;
}

test("本地 loopback origin 别名不会误拦管理登录", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: toAdminBaseURL(baseURL) },
  });

  try {
    const login = await api.post("/api/auth/login", { data: { key: ADMIN_SECRET } });
    expect(login.status(), await login.text()).toBe(200);
  } finally {
    await api.dispose();
  }
});

test("新增作品可在单个请求内同时写入图片列表", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  let workId = "";

  try {
    const created = await api.post("/api/works", {
      data: {
        title: `atomic-create-e2e-${Date.now()}`,
        description: "atomic create description",
        tags: ["atomic", "e2e"],
        imageUrl: GALLERY_IMAGES[1].imageUrl,
        thumbUrl: GALLERY_IMAGES[1].thumbUrl,
        pinned: false,
        sortOrder: 350,
        workDate: "2026-07",
        imageSize: 2049,
        sizeWeight: 1,
        images: GALLERY_IMAGES.map((image, index) => ({
          imageUrl: image.imageUrl,
          thumbUrl: image.thumbUrl,
          imageSize: 2048 + index,
          sortOrder: index,
        })),
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const createdBody = await created.json();
    workId = createdBody.id as string;

    const images = await api.get(`/api/works/${workId}/images`);
    expect(images.status()).toBe(200);
    const imageBody = await images.json();
    expect(imageBody.map((image: { image_url: string }) => image.image_url)).toEqual(GALLERY_IMAGES.map((image) => image.imageUrl));
  } finally {
    if (workId) await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("清空图片列表不会删除仍被封面引用的 R2 文件", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const cover = {
    imageUrl: `https://example.com/originals/keep-${stamp}.png`,
    thumbUrl: `https://example.com/thumbnails/keep-${stamp}.webp`,
  };
  const extra = {
    imageUrl: `https://example.com/originals/drop-${stamp}.png`,
    thumbUrl: `https://example.com/thumbnails/drop-${stamp}.webp`,
  };
  const workId = await createApiWork(api, `clear-images-e2e-${stamp}`, 400, { cover });

  try {
    const added = await api.post(`/api/works/${workId}/images`, {
      data: [
        { ...cover, imageSize: 1024, sortOrder: 0 },
        { ...extra, imageSize: 1025, sortOrder: 1 },
      ],
    });
    expect(added.status(), await added.text()).toBe(201);

    const cleared = await api.delete(`/api/works/${workId}/images`);
    expect(cleared.status(), await cleared.text()).toBe(200);

    const keepJob = await findR2DeleteJobContaining(cover.imageUrl);
    const dropJob = await findR2DeleteJobContaining(extra.imageUrl);
    expect(keepJob.rows.length).toBe(0);
    expect(dropJob.rows.length).toBeGreaterThan(0);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("详细介绍富文本会过滤危险 HTML", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  let sectionId = "";

  try {
    const created = await api.post("/api/detail-sections", {
      data: {
        title: `xss-e2e-${Date.now()}`,
        content: `<img src=x onerror="window.__xss=1"><strong>safe-bold</strong><script>window.__xss=1</script>`,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const createdBody = await created.json();
    sectionId = createdBody.id as string;

    await page.goto("/");
    await expect(page.getByText("safe-bold")).toBeVisible();
    const flagged = await page.evaluate(() => Boolean((window as unknown as { __xss?: boolean }).__xss));
    expect(flagged).toBe(false);
    const aboutHtml = await page.locator("#about").innerHTML();
    expect(aboutHtml).not.toContain("<script");
    expect(aboutHtml).not.toContain("onerror");
  } finally {
    if (sectionId) await api.delete(`/api/detail-sections/${sectionId}`);
    await api.dispose();
  }
});

async function findR2DeleteJobContaining(value: string) {
  const client = createClient({ url: "file:./e2e.db" });
  try {
    return await client.execute({
      sql: "SELECT urls_json FROM r2_delete_jobs WHERE urls_json LIKE ?",
      args: [`%${value}%`],
    });
  } finally {
    client.close();
  }
}

function workRow(page: Page, title: string) {
  return page
    .getByRole("heading", { name: title, exact: true })
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' items-start ')][1]");
}

async function waitForReorderResponse(page: Page, action: () => Promise<void>) {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const timeout = setTimeout(() => {
    page.off("response", onResponse);
    reject(new Error("Timed out waiting for reorder"));
  }, 5000);

  const onResponse = (response: Response) => {
    if (response.request().method() !== "PUT") return;
    if (!response.url().endsWith("/api/works/reorder")) return;
    clearTimeout(timeout);
    page.off("response", onResponse);
    resolve(response);
  };

  page.on("response", onResponse);
  await action();
  return promise;
}

test.beforeAll(async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await loginAndCreateWork(baseURL);
  await api.dispose();
});

test.afterAll(async ({ baseURL }) => {
  if (!baseURL || !createdWorkId) return;
  const api = await newAdminApi(baseURL);
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
  const viewerImage = page.locator('[data-gallery-slide="0"] img').first();
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
  const api = await newAdminApi(baseURL);

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

test("图片列表同步不会覆盖已选择的封面", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);

  const selectedCover = GALLERY_IMAGES[1];
  const workId = await createApiWork(api, `cover-e2e-${Date.now()}`, 100, { cover: selectedCover });

  try {
    const replaced = await api.put(`/api/works/${workId}/images`, {
      data: GALLERY_IMAGES.map((image, index) => ({
        imageUrl: image.imageUrl,
        thumbUrl: image.thumbUrl,
        imageSize: 1024 + index,
        sortOrder: index,
      })),
    });
    expect(replaced.status()).toBe(200);

    const current = await api.get(`/api/works/${workId}`);
    expect(current.status()).toBe(200);
    const currentBody = await current.json();
    expect(currentBody.image_url).toBe(selectedCover.imageUrl);
    expect(currentBody.thumb_url).toBe(selectedCover.thumbUrl);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("给不存在的作品添加图片会返回 404", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);

  try {
    const response = await api.post(`/api/works/missing-${Date.now()}/images`, {
      data: {
        imageUrl: GALLERY_IMAGES[0].imageUrl,
        thumbUrl: GALLERY_IMAGES[0].thumbUrl,
        imageSize: 1024,
      },
    });

    expect(response.status()).toBe(404);
  } finally {
    await api.dispose();
  }
});

test("替换只有封面旧数据的作品时会排队清理旧 R2 文件", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);

  const stamp = Date.now();
  const legacyCover = {
    imageUrl: `https://example.com/originals/legacy-${stamp}.png`,
    thumbUrl: `https://example.com/thumbnails/legacy-${stamp}.webp`,
  };
  const nextCover = {
    imageUrl: `https://example.com/originals/next-${stamp}.png`,
    thumbUrl: `https://example.com/thumbnails/next-${stamp}.webp`,
  };
  const workId = await createApiWork(api, `legacy-cover-e2e-${stamp}`, 200, { cover: legacyCover });

  try {
    const current = await api.get(`/api/works/${workId}`);
    expect(current.status()).toBe(200);
    const currentBody = await current.json();
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const saved = await api.put(`/api/works/${workId}/save`, {
      data: {
        title: `legacy-cover-e2e-${stamp}-updated`,
        description: "updated description",
        tags: ["legacy", "e2e"],
        software: [],
        workDate: "2026-06",
        imageUrl: nextCover.imageUrl,
        thumbUrl: nextCover.thumbUrl,
        imageSize: 2048,
        sizeWeight: 1,
        expectedUpdatedAt: currentBody.updated_at,
        images: [{ ...nextCover, imageSize: 2048, sortOrder: 0 }],
      },
    });
    expect(saved.status()).toBe(200);

    const imageJob = await findR2DeleteJobContaining(legacyCover.imageUrl);
    const thumbJob = await findR2DeleteJobContaining(legacyCover.thumbUrl);
    expect(imageJob.rows.length).toBeGreaterThan(0);
    expect(thumbJob.rows.length).toBeGreaterThan(0);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("后台连续排序不会因为本地版本号过期而冲突", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);

  const titleA = `sort-a-e2e-${Date.now()}`;
  const titleB = `sort-b-e2e-${Date.now()}`;
  const baseSortOrder = Date.now();
  const workAId = await createApiWork(api, titleA, baseSortOrder);
  const workBId = await createApiWork(api, titleB, baseSortOrder - 1);

  try {
    const adminBaseURL = toAdminBaseURL(baseURL);
    await page.goto(`${adminBaseURL}/admin?key=${ADMIN_SECRET}`);
    await page.goto(`${adminBaseURL}/admin?tab=works`);
    await expect(workRow(page, titleA)).toBeVisible();
    await expect(workRow(page, titleB)).toBeVisible();
    await page.waitForTimeout(1200);

    const firstReorder = await waitForReorderResponse(page, () =>
      workRow(page, titleA).getByRole("button", { name: "下移排序" }).click()
    );
    expect(firstReorder.status()).toBe(200);

    const moveBackButton = workRow(page, titleB).getByRole("button", { name: "下移排序" });
    await expect(moveBackButton).toBeEnabled();
    const secondReorder = await waitForReorderResponse(page, () => moveBackButton.click());
    expect(secondReorder.status()).toBe(200);

    await expect(page.getByText("排序冲突，已刷新，请重试")).toHaveCount(0);
  } finally {
    await api.delete(`/api/works/${workAId}`);
    await api.delete(`/api/works/${workBId}`);
    await api.dispose();
  }
});

test("作品编辑保存用单个接口同步基础信息和图片列表", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);

  const title = `atomic-save-e2e-${Date.now()}`;
  const workId = await createApiWork(api, title, 300);
  const selectedCover = GALLERY_IMAGES[2];

  try {
    const current = await api.get(`/api/works/${workId}`);
    expect(current.status()).toBe(200);
    const currentBody = await current.json();
    const updatedTitle = `${title}-updated`;
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const saved = await api.put(`/api/works/${workId}/save`, {
      data: {
        title: updatedTitle,
        description: "updated description",
        tags: ["atomic", "e2e"],
        software: ["Blender"],
        workDate: "2026-06",
        imageUrl: selectedCover.imageUrl,
        thumbUrl: selectedCover.thumbUrl,
        imageSize: 2048,
        sizeWeight: 1.4,
        expectedUpdatedAt: currentBody.updated_at,
        images: GALLERY_IMAGES.map((image, index) => ({
          imageUrl: image.imageUrl,
          thumbUrl: image.thumbUrl,
          imageSize: 2048 + index,
          sortOrder: index,
        })),
      },
    });
    expect(saved.status()).toBe(200);

    const [updated, images] = await Promise.all([
      api.get(`/api/works/${workId}`),
      api.get(`/api/works/${workId}/images`),
    ]);
    expect(updated.status()).toBe(200);
    expect(images.status()).toBe(200);

    const updatedBody = await updated.json();
    expect(updatedBody.title).toBe(updatedTitle);
    expect(updatedBody.image_url).toBe(selectedCover.imageUrl);
    expect(updatedBody.thumb_url).toBe(selectedCover.thumbUrl);

    const imageBody = await images.json();
    expect(imageBody.map((image: { image_url: string }) => image.image_url)).toEqual(GALLERY_IMAGES.map((image) => image.imageUrl));

    const staleSave = await api.put(`/api/works/${workId}/save`, {
      data: {
        title: "stale update",
        description: "stale",
        tags: [],
        software: [],
        workDate: "",
        imageUrl: GALLERY_IMAGES[0].imageUrl,
        thumbUrl: GALLERY_IMAGES[0].thumbUrl,
        imageSize: 1,
        sizeWeight: 1,
        expectedUpdatedAt: currentBody.updated_at,
        images: [GALLERY_IMAGES[0]],
      },
    });
    expect(staleSave.status()).toBe(409);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test.describe("手机端相册式滑动预览", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("横向拖拽到中途时会同时露出当前图和下一张", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/work/${createdWorkId}`);
    await page.locator("button.cursor-zoom-in").first().click();

    const viewer = page.locator("[data-gallery-viewer]");
    const track = page.locator("[data-gallery-track]");
    const currentSlide = page.locator('[data-gallery-slide="0"]');
    const nextSlide = page.locator('[data-gallery-slide="1"]');

    await expect(track).toBeVisible();

    const box = await viewer.boundingBox();
    if (!box) throw new Error("viewer box not found");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - box.width * 0.42, box.y + box.height / 2, { steps: 12 });

    const currentBox = await currentSlide.boundingBox();
    const nextBox = await nextSlide.boundingBox();
    if (!currentBox || !nextBox) throw new Error("gallery slide boxes not found");

    expect(currentBox.x).toBeLessThan(box.x);
    expect(nextBox.x).toBeLessThan(box.x + box.width);
    expect(nextBox.x + nextBox.width).toBeGreaterThan(box.x + box.width * 0.55);

    await page.mouse.up();
    await expect(page.locator("text=2 / 3")).toBeVisible();
  });
});
