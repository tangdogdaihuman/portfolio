import crypto from "crypto";
import db from "@/lib/db";

const MAX_ATTEMPTS = 5;
const CODE_TTL_MS = 5 * 60 * 1000;

export async function generateCode(ip: string): Promise<string> {
  const code = crypto.randomInt(100000, 1000000).toString();
  await db.execute({
    sql: `INSERT INTO verification_codes (ip, code, expires_at, attempts) VALUES (?, ?, ?, 0)
          ON CONFLICT(ip) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`,
    args: [ip, code, Date.now() + CODE_TTL_MS],
  });
  return code;
}

export async function verifyCode(ip: string, input: string): Promise<boolean> {
  const now = Date.now();
  const res = await db.execute({
    sql: `UPDATE verification_codes SET attempts = attempts + 1
          WHERE ip = ? AND expires_at > ?
          RETURNING code, attempts`,
    args: [ip, now],
  });
  const row = res.rows[0];
  if (!row) {
    await db.execute({
      sql: "DELETE FROM verification_codes WHERE ip = ? AND expires_at <= ?",
      args: [ip, now],
    });
    return false;
  }

  if (Number(row.attempts) > MAX_ATTEMPTS) {
    await db.execute({ sql: "DELETE FROM verification_codes WHERE ip = ?", args: [ip] });
    return false;
  }

  const a = Buffer.from(String(row.code));
  const b = Buffer.from(input);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    await db.execute({ sql: "DELETE FROM verification_codes WHERE ip = ?", args: [ip] });
    return true;
  }

  return false;
}
