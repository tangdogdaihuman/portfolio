import { expect, test } from "@playwright/test";
import { createClient } from "@libsql/client";
import { enqueueR2DeleteInTransaction } from "../lib/r2-delete-jobs";
import { deleteR2Keys } from "../lib/r2";
import { newAdminApi } from "./admin-api";

async function clearR2DeleteJobs() {
  const client = createClient({ url: "file:./e2e.db" });
  try {
    await client.execute("DELETE FROM r2_delete_jobs");
  } finally {
    client.close();
  }
}

test("R2 delete helper propagates storage delete failures", async () => {
  const client = {
    send: async () => {
      throw new Error("delete failed");
    },
  };

  await expect(deleteR2Keys(client, "bucket", ["originals/a.png"])).rejects.toThrow("delete failed");
});

test("R2 delete jobs can be enqueued through an existing transaction executor", async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const transaction = {
    execute: async (statement: { sql: string; args?: unknown }) => {
      calls.push({ sql: statement.sql, args: Array.isArray(statement.args) ? statement.args : [] });
      return { rows: [], rowsAffected: 1 };
    },
  };

  await enqueueR2DeleteInTransaction(transaction, [
    "https://cdn.example.com/originals/a.png",
    "https://cdn.example.com/originals/a.png",
    "",
  ]);

  expect(calls).toHaveLength(1);
  expect(calls[0].sql).toContain("INSERT INTO r2_delete_jobs");
  expect(JSON.parse(calls[0].args[1] as string)).toEqual(["https://cdn.example.com/originals/a.png"]);
});

test("admin maintenance endpoint runs cleanup for authenticated requests", async ({ baseURL }) => {
  await clearR2DeleteJobs();
  const api = await newAdminApi(baseURL!);
  const response = await api.post("/api/maintenance");
  expect(response.status(), await response.text()).toBe(200);

  const body = await response.json() as {
    processed: number;
    succeeded: number;
    failed: number;
    pending: number;
    retention: Record<string, number>;
  };
  expect(body).toMatchObject({
    processed: expect.any(Number),
    succeeded: expect.any(Number),
    failed: expect.any(Number),
    pending: expect.any(Number),
    retention: {
      rateLimits: expect.any(Number),
      verificationCodes: expect.any(Number),
      auditLogs: expect.any(Number),
      visits: expect.any(Number),
    },
  });
});

test("maintenance endpoint rejects unauthenticated requests", async ({ request, baseURL }) => {
  const response = await request.post("/api/maintenance", {
    headers: { origin: baseURL! },
  });
  expect(response.status()).toBe(401);
});
