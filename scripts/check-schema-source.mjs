import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const files = [
  path.join(process.cwd(), "lib", "db.ts"),
  path.join(process.cwd(), "scripts", "push-schema.ts"),
];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  assert.match(content, /BASE_SCHEMA_SQL/, `${file} should reference BASE_SCHEMA_SQL`);
  assert.match(content, /COLUMN_PATCHES/, `${file} should reference COLUMN_PATCHES`);
  assert.match(content, /RECORDED_MIGRATIONS/, `${file} should reference RECORDED_MIGRATIONS`);
}

console.log("schema-source check passed");
