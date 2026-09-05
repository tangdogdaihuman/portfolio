import { expect, test, type APIRequestContext, type Page, type Response } from "@playwright/test";
import { createClient } from "@libsql/client";
import { ADMIN_SECRET, newAdminApi, toAdminBaseURL } from "./admin-api";

const WORK_IMAGE = "https://placehold.co/1400x1800.png";
const WORK_THUMB = "https://placehold.co/700x900.webp";

async function createApiWork(
  api: APIRequestContext,
  title: string,
  sortOrder: number
): Promise<string> {
  const created = await api.post("/api/works", {
    data: {
      title,
      description: "e2e description",
      tags: ["e2e"],
      imageUrl: WORK_IMAGE,
      thumbUrl: WORK_THUMB,
      pinned: false,
      sortOrder,
      workDate: "2026-05",
      imageSize: 1024,
      sizeWeight: 1,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const createdBody = await created.json();
  return createdBody.id as string;
}

async function listWorks(api: APIRequestContext) {
  const res = await api.get("/api/works");
  expect(res.status()).toBe(200);
  return (await res.json()) as Array<{ id: string; sort_order: number }>;
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

function findR2DeleteJobContaining(value: string) {
  const client = createClient({ url: "file:./e2e.db" });
  return client
    .execute({
      sql: "SELECT urls_json FROM r2_delete_jobs WHERE urls_json LIKE ?",
      args: [`%${value}%`],
    })
    .finally(() => client.close());
}

test("CSP connect-src 允许 R2 直传域", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const csp = response.headers()["content-security-policy"] || "";
  const connectSrc = csp.split(";").find((directive) => directive.trim().startsWith("connect-src")) || "";
  expect(connectSrc).toContain("https://local.r2.cloudflarestorage.com");
});

test("非法图片替换请求返回 400 且不改动现有图片", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const workId = await createApiWork(api, `image-validate-e2e-${stamp}`, 0);
  const images = [
    { imageUrl: `https://example.com/originals/v1-${stamp}.png`, thumbUrl: `https://example.com/thumbnails/v1-${stamp}.webp` },
    { imageUrl: `https://example.com/originals/v2-${stamp}.png`, thumbUrl: `https://example.com/thumbnails/v2-${stamp}.webp` },
  ];

  try {
    const added = await api.post(`/api/works/${workId}/images`, {
      data: images.map((image, index) => ({ ...image, imageSize: 1024 + index, sortOrder: index })),
    });
    expect(added.status(), await added.text()).toBe(201);

    const nonArray = await api.put(`/api/works/${workId}/images`, {
      data: { imageUrl: images[0].imageUrl, thumbUrl: images[0].thumbUrl },
    });
    expect(nonArray.status()).toBe(400);

    const mixedInvalid = await api.put(`/api/works/${workId}/images`, {
      data: [
        { imageUrl: images[0].imageUrl, thumbUrl: images[0].thumbUrl },
        { thumbUrl: images[1].thumbUrl },
      ],
    });
    expect(mixedInvalid.status()).toBe(400);

    const current = await api.get(`/api/works/${workId}/images`);
    expect(current.status()).toBe(200);
    const currentBody = await current.json();
    expect(currentBody.map((image: { image_url: string }) => image.image_url)).toEqual(images.map((image) => image.imageUrl));
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("默认同排序值作品上移后顺序持久化", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const titleA = `order-a-e2e-${stamp}`;
  const titleB = `order-b-e2e-${stamp}`;
  const workAId = await createApiWork(api, titleA, 0);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const workBId = await createApiWork(api, titleB, 0);

  try {
    const adminBaseURL = toAdminBaseURL(baseURL);
    await page.goto(`${adminBaseURL}/admin?key=${ADMIN_SECRET}`);
    await page.goto(`${adminBaseURL}/admin?tab=works`);
    await expect(workRow(page, titleA)).toBeVisible();
    await expect(workRow(page, titleB)).toBeVisible();
    await page.waitForTimeout(1200);

    const reorder = await waitForReorderResponse(page, () =>
      workRow(page, titleA).getByRole("button", { name: "上移排序" }).click()
    );
    expect(reorder.status()).toBe(200);

    const works = await listWorks(api);
    const movedA = works.find((work) => work.id === workAId);
    const stayedB = works.find((work) => work.id === workBId);
    expect(movedA?.sort_order).toBe(1);
    expect(stayedB?.sort_order).toBe(0);

    const indexA = works.findIndex((work) => work.id === workAId);
    const indexB = works.findIndex((work) => work.id === workBId);
    expect(indexA).toBeLessThan(indexB);
  } finally {
    await api.delete(`/api/works/${workAId}`);
    await api.delete(`/api/works/${workBId}`);
    await api.dispose();
  }
});

test("图片追加推进作品版本，过期保存被拒绝", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const workId = await createApiWork(api, `version-bump-e2e-${stamp}`, 0);

  try {
    const before = await api.get(`/api/works/${workId}`);
    expect(before.status()).toBe(200);
    const beforeBody = await before.json();
    const staleUpdatedAt = beforeBody.updated_at as string;

    const added = await api.post(`/api/works/${workId}/images`, {
      data: [{ imageUrl: WORK_IMAGE, thumbUrl: WORK_THUMB, imageSize: 1024, sortOrder: 0 }],
    });
    expect(added.status(), await added.text()).toBe(201);

    const staleSave = await api.put(`/api/works/${workId}/save`, {
      data: {
        title: `version-bump-e2e-${stamp}-stale`,
        description: "stale",
        tags: [],
        software: [],
        workDate: "",
        imageUrl: WORK_IMAGE,
        thumbUrl: WORK_THUMB,
        imageSize: 1,
        sizeWeight: 1,
        expectedUpdatedAt: staleUpdatedAt,
        images: [{ imageUrl: WORK_IMAGE, thumbUrl: WORK_THUMB, imageSize: 1, sortOrder: 0 }],
      },
    });
    expect(staleSave.status()).toBe(409);
    const staleBody = await staleSave.json();
    expect(staleBody.code).toBe("CONFLICT");
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("清理队列执行时跳过仍被作品引用的文件", async ({ request, baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const cover = {
    imageUrl: `https://example.com/originals/protected-${stamp}.png`,
    thumbUrl: `https://example.com/thumbnails/protected-${stamp}.webp`,
  };
  const workId = await createApiWork(api, `r2-ref-e2e-${stamp}`, 0);

  try {
    const cleanup = await api.post("/api/upload/cleanup", {
      data: { urls: [cover.imageUrl, cover.thumbUrl] },
    });
    expect(cleanup.status(), await cleanup.text()).toBe(200);

    const cron = await request.get(`${toAdminBaseURL(baseURL)}/api/cron/r2-delete`, {
      headers: { authorization: "Bearer e2e-cron-secret" },
    });
    expect(cron.status(), await cron.text()).toBe(200);
    const cronBody = await cron.json();
    expect(cronBody.succeeded).toBeGreaterThan(0);

    const job = await findR2DeleteJobContaining(cover.imageUrl);
    expect(job.rows.length).toBe(0);

    const work = await api.get(`/api/works/${workId}`);
    expect(work.status()).toBe(200);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("删除最后一张图片被拒绝且封面保留", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const workId = await createApiWork(api, `last-image-e2e-${stamp}`, 0);

  try {
    const added = await api.post(`/api/works/${workId}/images`, {
      data: [{ imageUrl: WORK_IMAGE, thumbUrl: WORK_THUMB, imageSize: 1024, sortOrder: 0 }],
    });
    expect(added.status(), await added.text()).toBe(201);
    const imageId = ((await added.json()).ids as string[])[0];
    expect(imageId).toBeTruthy();

    const blocked = await api.delete(`/api/works/images/${imageId}`);
    expect(blocked.status(), await blocked.text()).toBe(409);
    const blockedBody = await blocked.json();
    expect(blockedBody.code).toBe("CONFLICT");
    expect(blockedBody.message).toBe("作品至少需要保留一张图片");

    const images = await api.get(`/api/works/${workId}/images`);
    expect(images.status()).toBe(200);
    const imagesBody = await images.json();
    expect(imagesBody.map((image: { image_url: string }) => image.image_url)).toEqual([WORK_IMAGE]);

    const work = await api.get(`/api/works/${workId}`);
    expect(work.status()).toBe(200);
    const workBody = await work.json();
    expect(workBody.image_url).toBeTruthy();
    expect(workBody.thumb_url).toBeTruthy();
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("图片批量追加含非法项时整批拒绝且不写入", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const kept = {
    imageUrl: `https://example.com/originals/kept-${stamp}.png`,
    thumbUrl: `https://example.com/thumbnails/kept-${stamp}.webp`,
  };
  const orphan = {
    imageUrl: `https://example.com/originals/orphan-${stamp}.png`,
    thumbUrl: `https://example.com/thumbnails/orphan-${stamp}.webp`,
  };
  const workId = await createApiWork(api, `mixed-add-e2e-${stamp}`, 0);

  try {
    const added = await api.post(`/api/works/${workId}/images`, {
      data: [{ ...kept, imageSize: 1024, sortOrder: 0 }],
    });
    expect(added.status(), await added.text()).toBe(201);

    const mixed = await api.post(`/api/works/${workId}/images`, {
      data: [
        { ...orphan, imageSize: 1024, sortOrder: 1 },
        { imageUrl: "not-a-url", thumbUrl: orphan.thumbUrl },
      ],
    });
    expect(mixed.status(), await mixed.text()).toBe(400);
    const mixedBody = await mixed.json();
    expect(mixedBody.code).toBe("BAD_REQUEST");
    expect(mixedBody.message).toContain("1/2");
    expect(mixedBody.ids).toBeUndefined();

    const current = await api.get(`/api/works/${workId}/images`);
    expect(current.status()).toBe(200);
    const currentBody = await current.json();
    expect(currentBody.map((image: { image_url: string }) => image.image_url)).toEqual([kept.imageUrl]);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("图片追加接口对畸形 JSON 返回 400", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const workId = await createApiWork(api, `broken-json-e2e-${stamp}`, 0);

  try {
    const broken = await api.post(`/api/works/${workId}/images`, {
      data: "{ imageUrl: https://example.com/originals/broken-",
      headers: { "content-type": "application/json" },
    });
    expect(broken.status()).toBe(400);
    const brokenBody = await broken.json();
    expect(brokenBody.code).toBe("BAD_REQUEST");

    const images = await api.get(`/api/works/${workId}/images`);
    expect(images.status()).toBe(200);
    expect(((await images.json()) as unknown[]).length).toBeLessThanOrEqual(1);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("空 expectedUpdatedAt 不再绕过并发写校验", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const title = `occ-empty-e2e-${stamp}`;
  const workId = await createApiWork(api, title, 0);

  try {
    const emptyPut = await api.put(`/api/works/${workId}`, {
      data: { title: `${title}-overwritten`, expectedUpdatedAt: "" },
    });
    expect(emptyPut.status(), await emptyPut.text()).toBe(400);
    expect((await emptyPut.json()).code).toBe("BAD_REQUEST");

    const emptySave = await api.put(`/api/works/${workId}/save`, {
      data: {
        title: `${title}-saved`,
        description: "e2e description",
        tags: [],
        software: [],
        workDate: "",
        imageUrl: WORK_IMAGE,
        thumbUrl: WORK_THUMB,
        imageSize: 1,
        sizeWeight: 1,
        expectedUpdatedAt: "",
        images: [{ imageUrl: WORK_IMAGE, thumbUrl: WORK_THUMB, imageSize: 1, sortOrder: 0 }],
      },
    });
    expect(emptySave.status(), await emptySave.text()).toBe(400);
    expect((await emptySave.json()).code).toBe("BAD_REQUEST");

    const work = await api.get(`/api/works/${workId}`);
    expect(work.status()).toBe(200);
    expect((await work.json()).title).toBe(title);

    const emptyReorder = await api.put("/api/works/reorder", {
      data: { items: [{ id: workId, sortOrder: 5, expectedUpdatedAt: "" }] },
    });
    expect(emptyReorder.status(), await emptyReorder.text()).toBe(400);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("含逗号的标签在写入时归一化且回读不再漂移", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);
  const stamp = Date.now();
  const created = await api.post("/api/works", {
    data: {
      title: `tag-normalize-e2e-${stamp}`,
      description: "e2e description",
      tags: ["  角色设计  ", "场景，概念", "角色设计", ""],
      software: ["Blender, ZBrush"],
      imageUrl: WORK_IMAGE,
      thumbUrl: WORK_THUMB,
      pinned: false,
      sortOrder: 0,
      workDate: "2026-05",
      imageSize: 1024,
      sizeWeight: 1,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const workId = (await created.json()).id as string;

  try {
    const work = await api.get(`/api/works/${workId}`);
    expect(work.status()).toBe(200);
    const workBody = await work.json();
    expect(workBody.tags).toEqual(["角色设计", "场景", "概念"]);
    expect(workBody.software).toEqual(["Blender", "ZBrush"]);

    const rewrite = await api.put(`/api/works/${workId}`, {
      data: { tags: workBody.tags, expectedUpdatedAt: workBody.updated_at },
    });
    expect(rewrite.status(), await rewrite.text()).toBe(200);

    const reread = await api.get(`/api/works/${workId}`);
    expect((await reread.json()).tags).toEqual(workBody.tags);
  } finally {
    await api.delete(`/api/works/${workId}`);
    await api.dispose();
  }
});

test("站点地图可访问且 lastmod 可解析", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("<urlset");
  const lastMods = [...body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
  expect(lastMods.length).toBeGreaterThan(0);
  for (const lastMod of lastMods) {
    expect(Number.isNaN(new Date(lastMod).getTime())).toBe(false);
  }
});
