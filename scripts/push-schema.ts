import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
import {
  BASE_SCHEMA_SQL,
  COLUMN_PATCHES,
  RECORDED_MIGRATIONS,
  addColumnIfMissing,
  recordMigration,
} from "../lib/schema";

dotenv.config({ path: ".env.local" });

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  await client.executeMultiple(BASE_SCHEMA_SQL);
  for (const patch of COLUMN_PATCHES) {
    await addColumnIfMissing(client, patch.table, patch.column, patch.definition);
  }
  for (const version of RECORDED_MIGRATIONS) {
    await recordMigration(client, version);
  }

  console.log("Schema pushed successfully");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
