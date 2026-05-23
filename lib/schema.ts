import type { Client } from "@libsql/client";

export const BASE_SCHEMA_SQL = `
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
`;

export const COLUMN_PATCHES = [
  { table: "works", column: "work_date", definition: "TEXT DEFAULT ''" },
  { table: "works", column: "image_size", definition: "INTEGER DEFAULT 0" },
  { table: "works", column: "size_weight", definition: "REAL DEFAULT 1.0" },
  { table: "work_images", column: "image_size", definition: "INTEGER DEFAULT 0" },
] as const;

export const RECORDED_MIGRATIONS = [
  "0001_portfolio_baseline",
  "0002_work_metadata_columns",
] as const;

export async function addColumnIfMissing(
  client: Client,
  table: string,
  column: string,
  definition: string
) {
  const columns = await client.execute(`PRAGMA table_info(${table})`);
  if (columns.rows.some((row) => row.name === column)) return;
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function recordMigration(client: Client, version: string) {
  await client.execute({
    sql: "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
    args: [version],
  });
}

