import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const files = [
  { file: path.join(process.cwd(), "lib", "db.ts"), specifiers: ["@/lib/schema", "./schema"] },
  { file: path.join(process.cwd(), "scripts", "push-schema.ts"), specifiers: ["../lib/schema", "@/lib/schema"] },
];

const IDENTIFIERS = ["BASE_SCHEMA_SQL", "COLUMN_PATCHES", "RECORDED_MIGRATIONS"];

for (const { file, specifiers } of files) {
  const content = fs.readFileSync(file, "utf8");
  const escaped = specifiers.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = content.match(new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*["'](?:${escaped})["']`));
  assert.ok(match, `${file} should import the schema from lib/schema`);
  for (const name of IDENTIFIERS) {
    assert.ok(match[0].includes(name), `${file} schema import should include ${name}`);
    assert.doesNotMatch(content, new RegExp(`(const|let|var)\\s+${name}\\s*=`), `${file} should not redeclare ${name} locally`);
  }
}

console.log("schema-source check passed");