import { createClient, Client } from "@libsql/client";

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
    await addColumnIfMissing(client, "works", "work_date", "TEXT DEFAULT ''");
    await addColumnIfMissing(client, "works", "image_size", "INTEGER DEFAULT 0");
    await addColumnIfMissing(client, "works", "size_weight", "REAL DEFAULT 1.0");
    await addColumnIfMissing(client, "work_images", "image_size", "INTEGER DEFAULT 0");
    await recordMigration(client, "0001_portfolio_baseline");
    await recordMigration(client, "0002_work_metadata_columns");
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
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      tags TEXT DEFAULT '',
      image_url TEXT NOT NULL,
      thumb_url TEXT NOT NULL,
      pinned INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      work_date TEXT DEFAULT '',
      image_size INTEGER DEFAULT 0,
      size_weight REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_images (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      thumb_url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      image_size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS intro (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO intro (id, content) VALUES (1, '');

    CREATE TABLE IF NOT EXISTS details (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO details (id, content) VALUES (1, '');

    CREATE TABLE IF NOT EXISTS detail_sections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

async function addColumnIfMissing(
  client: Client,
  table: string,
  column: string,
  definition: string
) {
  const columns = await client.execute(`PRAGMA table_info(${table})`);
  if (columns.rows.some((row) => row.name === column)) return;
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function recordMigration(client: Client, version: string) {
  await client.execute({
    sql: "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
    args: [version],
  });
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
