import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

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

    CREATE TABLE IF NOT EXISTS detail_sections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log("Schema pushed successfully");
}

main().catch(console.error);
