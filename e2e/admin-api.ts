import { expect, request } from "@playwright/test";

export const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "e2e-admin-secret";

export function toAdminBaseURL(baseURL: string) {
  return baseURL.replace("127.0.0.1", "localhost");
}

export async function newAdminApi(baseURL: string) {
  const apiBaseURL = toAdminBaseURL(baseURL);
  const api = await request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { origin: apiBaseURL },
  });
  const login = await api.post("/api/auth/login", {
    headers: { origin: apiBaseURL },
    data: { key: ADMIN_SECRET },
  });
  expect(login.status(), await login.text()).toBe(200);
  return api;
}
