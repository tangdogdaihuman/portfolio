import assert from "node:assert/strict";
import dotenv from "dotenv";
import { resolveSmokeSettings } from "./smoke-settings.mjs";

dotenv.config({ path: ".env.local" });

const {
  baseUrl,
  adminKey,
  checkRateLimit,
  allowAdminWrites,
  productionMode,
} = resolveSmokeSettings();

async function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !headers.has("origin")) {
    headers.set("origin", baseUrl);
  }
  if (!headers.has("referer")) {
    headers.set("referer", `${baseUrl}/`);
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { res, text, json };
}

async function main() {
  const home = await request("/");
  assert.equal(home.res.status, 200, "GET / should return 200");
  assert.match(home.text, /Portfolio|作品集|Tang Zihang/i, "Home HTML should contain site content");

  const works = await request("/api/works");
  assert.equal(works.res.status, 200, "GET /api/works should return 200");
  assert.ok(Array.isArray(works.json), "GET /api/works should return an array");

  if (works.json.length > 0) {
    const first = works.json[0];
    assert.ok(first.id, "First work should have id");
    const detail = await request(`/work/${first.id}`);
    assert.equal(detail.res.status, 200, "GET /work/:id should return 200");
  }

  if (!adminKey) {
    console.log("smoke: public routes passed; admin tests skipped (ADMIN_KEY missing)");
    return;
  }

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: adminKey }),
  });
  assert.equal(login.res.status, 200, "POST /api/auth/login should return 200 with valid key");
  const setCookie = login.res.headers.get("set-cookie");
  assert.ok(setCookie, "Login should set admin cookie");
  const cookie = setCookie.split(";")[0];

  if (!allowAdminWrites) {
    const target = productionMode ? "production" : "remote";
    console.log(`smoke: public routes and admin login passed; ${target} admin CRUD skipped (set SMOKE_ALLOW_WRITES=1 to enable writes)`);
    return;
  }

  const draft = {
    title: "__smoke_test__",
    description: "smoke",
    tags: ["smoke"],
    imageUrl: "https://example.com/smoke-original.jpg",
    thumbUrl: "https://example.com/smoke-thumb.webp",
    pinned: false,
    sortOrder: 0,
    workDate: "2026-01",
    imageSize: 1234,
    sizeWeight: 1,
  };

  const created = await request("/api/works", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(draft),
  });
  assert.equal(created.res.status, 201, "POST /api/works should create draft work");
  assert.ok(created.json?.id, "Created work should have id");

  const createdId = created.json.id;
  const updated = await request(`/api/works/${createdId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "__smoke_test_updated__" }),
  });
  assert.equal(updated.res.status, 200, "PUT /api/works/:id should update");

  const removed = await request(`/api/works/${createdId}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  assert.equal(removed.res.status, 200, "DELETE /api/works/:id should delete");

  if (checkRateLimit) {
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const attempt = await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: `__wrong_${i}__` }),
      });
      if (attempt.res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, "Rate limit check enabled, expected at least one 429");
  }

  console.log("smoke: public and admin checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
