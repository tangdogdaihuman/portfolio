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
    try { await client.execute("ALTER TABLE works ADD COLUMN work_date TEXT DEFAULT ''"); } catch {}
    try { await client.execute("ALTER TABLE works ADD COLUMN image_size INTEGER DEFAULT 0"); } catch {}
    try { await client.execute(`CREATE TABLE IF NOT EXISTS work_images (id TEXT PRIMARY KEY, work_id TEXT NOT NULL, image_url TEXT NOT NULL, thumb_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0, image_size INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`); } catch {}
    try { await client.execute("ALTER TABLE work_images ADD COLUMN image_size INTEGER DEFAULT 0"); } catch {}
    try { await client.execute(`CREATE TABLE IF NOT EXISTS details (id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1), content TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`); } catch {}
    _migrated = true;
  })();
  return _migrationPromise;
}

export function initializeDb() {
  const client = getClient();
  return client.executeMultiple(`
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    ALTER TABLE works ADD COLUMN work_date TEXT DEFAULT '';
    ALTER TABLE works ADD COLUMN image_size INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS work_images (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      thumb_url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      image_size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    ALTER TABLE work_images ADD COLUMN image_size INTEGER DEFAULT 0;

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
  `);
}

const db = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      if (!_migrated) {
        return async (...args: unknown[]) => {
          await runMigrations().catch(() => {});
          return (value as (...args: unknown[]) => unknown).apply(client, args);
        };
      }
      return value.bind(client);
    }
    return value;
  },
});

export default db;
