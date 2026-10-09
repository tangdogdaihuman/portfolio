import { expect, test } from "@playwright/test";
import { ADMIN_SECRET, newAdminApi } from "./admin-api";

async function overlayState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const read = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return null;
      const style = getComputedStyle(el);
      return { visibility: style.visibility, opacity: style.opacity };
    };
    return { bead: read(".bead-cursor"), ring: read(".bead-ring") };
  });
}

async function openAdminOnTab(page: import("@playwright/test").Page, baseURL: string, tab: string) {
  await page.goto(`${baseURL}/admin?key=${ADMIN_SECRET}`);
  await page.click(`#admin-tab-${tab}`);
}

async function hoverOver(
  page: import("@playwright/test").Page,
  box: { x: number; y: number; width: number; height: number }
) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2 + 8, { steps: 5 });
  await page.waitForTimeout(300);
}

test.describe("输入框内的原生光标", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("个人介绍输入框保留原生文字光标，玻璃光点移出绘制层", async ({ page, baseURL }) => {
    await openAdminOnTab(page, baseURL!, "intro");

    const textarea = page.locator("#intro-content");
    await textarea.waitFor({ timeout: 30000 });
    await textarea.scrollIntoViewIfNeeded();
    const box = await textarea.boundingBox();
    expect(box).not.toBeNull();
    await hoverOver(page, box!);

    expect(await textarea.evaluate((el) => getComputedStyle(el).cursor)).toBe("text");
    const state = await overlayState(page);
    expect(state.bead?.visibility).toBe("hidden");
    expect(state.ring?.visibility).toBe("hidden");
  });

  test("详细介绍富文本的加粗片段上原生光标仍然可见", async ({ page, baseURL }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const api = await newAdminApi(baseURL);
    const title = `cursor-e2e-${Date.now()}`;
    let sectionId = "";

    try {
      const created = await api.post("/api/detail-sections", {
        data: { title, content: "<strong>光标回归加粗片段</strong>" },
      });
      expect(created.status(), await created.text()).toBe(201);
      sectionId = (await created.json()).id as string;

      await openAdminOnTab(page, baseURL, "detail");
      const editor = page.locator("[contenteditable]").first();
      await editor.waitFor({ timeout: 30000 });
      await editor.scrollIntoViewIfNeeded();

      const strong = page.locator("[contenteditable] strong").first();
      await expect(strong).toBeVisible();
      const box = await strong.boundingBox();
      expect(box).not.toBeNull();
      await hoverOver(page, box!);

      expect(await strong.evaluate((el) => getComputedStyle(el).cursor)).toBe("text");
      expect((await overlayState(page)).bead?.visibility).toBe("hidden");
    } finally {
      if (sectionId) await api.delete(`/api/detail-sections/${sectionId}`);
      await api.dispose();
    }
  });

  test("移出输入框后玻璃光点恢复可见", async ({ page, baseURL }) => {
    await openAdminOnTab(page, baseURL!, "intro");

    const textarea = page.locator("#intro-content");
    await textarea.waitFor({ timeout: 30000 });
    await textarea.scrollIntoViewIfNeeded();
    const box = await textarea.boundingBox();
    await hoverOver(page, box!);

    await page.mouse.move(20, 20, { steps: 8 });
    await page.mouse.move(40, 40, { steps: 3 });
    await expect
      .poll(async () => (await overlayState(page)).bead?.visibility, { timeout: 5000 })
      .toBe("visible");
  });
});
