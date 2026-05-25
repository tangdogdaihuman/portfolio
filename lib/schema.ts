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
    software TEXT DEFAULT '',
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
    tagline TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_work_images_work_id_sort
    ON work_images(work_id, sort_order, created_at);
  CREATE INDEX IF NOT EXISTS idx_works_list_order
    ON works(pinned, sort_order, created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_scope_created
    ON audit_logs(scope, created_at);

  CREATE TABLE IF NOT EXISTS r2_delete_jobs (
    id TEXT PRIMARY KEY,
    urls_json TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_run_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_r2_delete_jobs_due
    ON r2_delete_jobs(next_run_at, attempts);
`;

export const COLUMN_PATCHES = [
  { table: "works", column: "work_date", definition: "TEXT DEFAULT ''" },
  { table: "works", column: "software", definition: "TEXT DEFAULT ''" },
  { table: "works", column: "image_size", definition: "INTEGER DEFAULT 0" },
  { table: "works", column: "size_weight", definition: "REAL DEFAULT 1.0" },
  { table: "intro", column: "tagline", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "work_images", column: "image_size", definition: "INTEGER DEFAULT 0" },
] as const;

export const RECORDED_MIGRATIONS = [
  "0001_portfolio_baseline",
  "0002_work_metadata_columns",
  "0003_indexes_and_audit_logs",
  "0004_r2_delete_retry_jobs",
  "0005_intro_tagline_and_work_software",
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
