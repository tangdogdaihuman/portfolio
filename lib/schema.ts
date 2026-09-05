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
    media_type TEXT NOT NULL DEFAULT 'image',
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
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs(created_at);

  CREATE INDEX IF NOT EXISTS idx_works_image_url
    ON works(image_url);
  CREATE INDEX IF NOT EXISTS idx_works_thumb_url
    ON works(thumb_url);
  CREATE INDEX IF NOT EXISTS idx_work_images_image_url
    ON work_images(image_url);
  CREATE INDEX IF NOT EXISTS idx_work_images_thumb_url
    ON work_images(thumb_url);

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

  CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL DEFAULT '',
    referrer TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    ip_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_visits_created_at
    ON visits(created_at);
  CREATE INDEX IF NOT EXISTS idx_visits_path_created
    ON visits(path, created_at);
  CREATE INDEX IF NOT EXISTS idx_visits_ip_hash_created
    ON visits(ip_hash, created_at);

  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification_codes (
    ip TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
`;

export const COLUMN_PATCHES = [
  { table: "works", column: "work_date", definition: "TEXT DEFAULT ''" },
  { table: "works", column: "software", definition: "TEXT DEFAULT ''" },
  { table: "works", column: "image_size", definition: "INTEGER DEFAULT 0" },
  { table: "works", column: "size_weight", definition: "REAL DEFAULT 1.0" },
  { table: "intro", column: "tagline", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "work_images", column: "image_size", definition: "INTEGER DEFAULT 0" },
  { table: "work_images", column: "media_type", definition: "TEXT NOT NULL DEFAULT 'image'" },
] as const;

export const RECORDED_MIGRATIONS = [
  "0001_portfolio_baseline",
  "0002_work_metadata_columns",
  "0003_indexes_and_audit_logs",
  "0004_r2_delete_retry_jobs",
  "0005_intro_tagline_and_work_software",
  "0006_visits_table",
  "0007_rate_limits_table",
  "0008_verification_codes_table",
  "0009_media_url_reference_indexes",
  "0010_stats_and_retention_indexes",
] as const;

export type ColumnPatch = (typeof COLUMN_PATCHES)[number];

export type ColumnPatchInput = {
  table: string;
  column: string;
  definition: string;
};

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function groupColumnPatches(): Array<{ table: string; columns: string[] }> {
  const groups: Array<{ table: string; columns: string[] }> = [];
  for (const patch of COLUMN_PATCHES) {
    const existing = groups.find((group) => group.table === patch.table);
    if (existing) {
      if (!existing.columns.includes(patch.column)) existing.columns.push(patch.column);
    } else {
      groups.push({ table: patch.table, columns: [patch.column] });
    }
  }
  return groups;
}

export const COLUMN_PATCH_GROUPS = groupColumnPatches();

export const PROBE_LEDGER_ALIAS = "ledger_versions";

function probeColumnAlias(table: string): string {
  return `${table.replace(/[^A-Za-z0-9_]/g, "")}_columns`;
}

const probeColumns = COLUMN_PATCH_GROUPS.map(
  (group) =>
    `(SELECT group_concat(name, ',') FROM pragma_table_info(${quoteLiteral(group.table)})
              WHERE name IN (${group.columns.map(quoteLiteral).join(", ")})) AS ${probeColumnAlias(group.table)}`
);

const probeLedger = `(SELECT group_concat(version, ',') FROM schema_migrations
              WHERE version IN (${RECORDED_MIGRATIONS.map(quoteLiteral).join(", ")})) AS ${PROBE_LEDGER_ALIAS}`;

export const SCHEMA_PROBE_SQL = `SELECT ${[...probeColumns, probeLedger].join(",\n    ")}`;

export const SCHEMA_LEDGER_SQL = RECORDED_MIGRATIONS.map(
  (version) => `INSERT OR IGNORE INTO schema_migrations (version) VALUES (${quoteLiteral(version)});`
).join("\n");

function splitConcat(value: unknown): string[] {
  return typeof value === "string" && value ? value.split(",").filter(Boolean) : [];
}

export function schemaProbeSets(row: Record<string, unknown> | undefined | null): {
  columns: Set<string>;
  versions: Set<string>;
} {
  const columns = new Set<string>();
  const versions = new Set<string>();
  if (!row) return { columns, versions };
  for (const group of COLUMN_PATCH_GROUPS) {
    for (const column of splitConcat(row[probeColumnAlias(group.table)])) {
      columns.add(`${group.table}.${column}`);
    }
  }
  for (const version of splitConcat(row[PROBE_LEDGER_ALIAS])) {
    versions.add(version);
  }
  return { columns, versions };
}

const BUSY_ERROR_CODES = new Set([
  "SQLITE_BUSY",
  "SQLITE_BUSY_SNAPSHOT",
  "SQLITE_BUSY_RECOVERY",
  "SQLITE_LOCKED",
  "SQLITE_LOCKED_SHAREDCACHE",
]);

const BUSY_ERROR_PATTERN = /database is locked|database is busy|table is locked|\bSQLITE_(BUSY|LOCKED)\b/i;

const PRAGMA_FUNCTION_ERROR_PATTERN = /pragma_table_info|syntax error/i;

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error);
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code.toUpperCase() : "";
}

export function isDuplicateColumnError(error: unknown): boolean {
  return /duplicate column name/i.test(errorText(error));
}

export function isBusySchemaError(error: unknown): boolean {
  const code = errorCode(error);
  if (code && BUSY_ERROR_CODES.has(code)) return true;
  return BUSY_ERROR_PATTERN.test(errorText(error));
}

export function isProbeUnsupportedError(error: unknown): boolean {
  if (PRAGMA_FUNCTION_ERROR_PATTERN.test(errorText(error))) return true;
  return errorCode(error) === "SQLITE_ERROR";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSchemaSequence(client: Client, sql: string, attempts = 3) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await client.executeMultiple(sql);
      return;
    } catch (error) {
      if (!isBusySchemaError(error) || attempt === attempts - 1) throw error;
      lastError = error;
      await delay(80 * (attempt + 1));
    }
  }
  if (lastError) throw lastError;
}

export async function applyColumnPatch(client: Client, patch: ColumnPatchInput) {
  try {
    await client.execute(`ALTER TABLE ${patch.table} ADD COLUMN ${patch.column} ${patch.definition}`);
  } catch (error) {
    if (isDuplicateColumnError(error)) return;
    if (!isBusySchemaError(error)) throw error;
    const columns = await client.execute(`PRAGMA table_info(${patch.table})`);
    if (columns.rows.some((row) => row.name === patch.column)) return;
    throw error;
  }
}

export async function addColumnIfMissing(
  client: Client,
  table: string,
  column: string,
  definition: string
) {
  const columns = await client.execute(`PRAGMA table_info(${table})`);
  if (columns.rows.some((row) => row.name === column)) return;
  await applyColumnPatch(client, { table, column, definition });
}

export async function recordMigration(client: Client, version: string) {
  await client.execute({
    sql: "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
    args: [version],
  });
}
