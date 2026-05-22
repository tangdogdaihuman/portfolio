import "dotenv/config";
import { createClient } from "@libsql/client";

async function main() {
  const c = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN!,
  });
  await c.execute(`CREATE TABLE IF NOT EXISTS details (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await c.execute("INSERT OR IGNORE INTO details (id, content) VALUES (1, '')");
  console.log("done");
}

main();
