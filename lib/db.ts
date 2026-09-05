import { createClient, Client } from "@libsql/client";
import { reportMetric } from "@/lib/monitoring";
import {
  BASE_SCHEMA_SQL,
  COLUMN_PATCHES,
  RECORDED_MIGRATIONS,
  SCHEMA_LEDGER_SQL,
  SCHEMA_PROBE_SQL,
  addColumnIfMissing,
  applyColumnPatch,
  isProbeUnsupportedError,
  runSchemaSequence,
  schemaProbeSets,
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

function missingColumnPatches(columns: Set<string>) {
  return COLUMN_PATCHES.filter((patch) => !columns.has(`${patch.table}.${patch.column}`));
}

async function applyLedgerFromProbe(client: Client, versions: Set<string>) {
  if (RECORDED_MIGRATIONS.every((version) => versions.has(version))) return 0;
  await runSchemaSequence(client, SCHEMA_LEDGER_SQL);
  return 1;
}

async function applyMissingColumns(client: Client, columns: Set<string>) {
  let statements = 0;
  for (const patch of missingColumnPatches(columns)) {
    await applyColumnPatch(client, patch);
    statements += 1;
  }
  return statements;
}

async function migrateWithoutProbe(client: Client) {
  let statements = 0;
  for (const patch of COLUMN_PATCHES) {
    await addColumnIfMissing(client, patch.table, patch.column, patch.definition);
    statements += 1;
  }
  await runSchemaSequence(client, SCHEMA_LEDGER_SQL);
  statements += 1;
  return statements;
}

async function runMigrationSequence(client: Client) {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL;");
    await client.execute("PRAGMA busy_timeout = 5000;");
  }
  await runSchemaSequence(client, BASE_SCHEMA_SQL);
  let statements = 1;

  let probeRow: Record<string, unknown> | null = null;
  try {
    const probe = await client.execute(SCHEMA_PROBE_SQL);
    statements += 1;
    probeRow = probe.rows[0] ?? null;
  } catch (error) {
    if (!isProbeUnsupportedError(error)) throw error;
    reportMetric({
      scope: "db.migrate.probe_unsupported",
      value: 1,
      meta: { message: error instanceof Error ? error.message : "unknown" },
    });
    probeRow = null;
  }

  if (probeRow) {
    const { columns, versions } = schemaProbeSets(probeRow);
    statements += await applyMissingColumns(client, columns);
    statements += await applyLedgerFromProbe(client, versions);
  } else {
    statements += await migrateWithoutProbe(client);
  }

  reportMetric({
    scope: "db.migrate.statements",
    value: statements,
    meta: { engine: url.startsWith("file:") ? "sqlite" : "libsql" },
  });
  return statements;
}

async function runMigrations() {
  if (_migrated) return;
  if (_migrationPromise) return _migrationPromise;
  _migrationPromise = (async () => {
    await runMigrationSequence(getClient());
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

export const TOUCH_WORK_UPDATED_AT_SQL =
  "updated_at = MAX(strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', updated_at, '+0.001 seconds'))";

export function tagsToArray(s: unknown): string[] {
  if (typeof s !== "string" || !s) return [];
  return s.split(",").filter(Boolean);
}

export function tagsToString(tags: string[]): string {
  return tags.join(",");
}
