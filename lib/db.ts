import { createClient, Client } from "@libsql/client";
import {
  BASE_SCHEMA_SQL,
  COLUMN_PATCHES,
  RECORDED_MIGRATIONS,
  addColumnIfMissing,
  recordMigration,
} from "@/lib/schema";

let _client: Client | null = null;
let _migrated = false;
let _migrationPromise: Promise<void> | null = null;

function getClient(): Client {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    _client = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return _client;
}

async function runMigrations() {
  if (_migrated) return;
  if (_migrationPromise) return _migrationPromise;
  _migrationPromise = (async () => {
    const client = getClient();
    await createSchema(client);
    for (const patch of COLUMN_PATCHES) {
      await addColumnIfMissing(client, patch.table, patch.column, patch.definition);
    }
    for (const version of RECORDED_MIGRATIONS) {
      await recordMigration(client, version);
    }
    _migrated = true;
  })();
  try {
    await _migrationPromise;
  } catch (error) {
    _migrationPromise = null;
    throw error;
  }
}

export function initializeDb() {
  return runMigrations();
}

async function createSchema(client: Client) {
  await client.executeMultiple(BASE_SCHEMA_SQL);
}

const db = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return async (...args: unknown[]) => {
        await runMigrations();
        return value.apply(client, args);
      };
    }
    return value;
  },
});

export default db;

export async function ensureMigrated() {
  await runMigrations();
}

export function tagsToArray(s: unknown): string[] {
  if (typeof s !== "string" || !s) return [];
  return s.split(",").filter(Boolean);
}

export function tagsToString(tags: string[]): string {
  return tags.join(",");
}
