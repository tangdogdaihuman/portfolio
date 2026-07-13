import crypto from "crypto";

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const MAX_ATTEMPTS = 5;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 分钟有效

const codes = new Map<string, CodeEntry>();

let lastCleanup = 0;
const CLEANUP_INTERVAL = 60_000;

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of codes) {
    if (entry.expiresAt <= now) codes.delete(key);
  }
}

// 发送频率限制：同一 IP 每分钟最多 1 次
const rateMap = new Map<string, number>();
const RATE_LIMIT_MS = 30_000;

export function isRateLimited(ip: string): boolean {
  cleanup(Date.now());
  const last = rateMap.get(ip);
  return last ? Date.now() - last < RATE_LIMIT_MS : false;
}

export function setRateLimit(ip: string): void {
  rateMap.set(ip, Date.now());
}

export function generateCode(ip: string): string {
  const code = crypto.randomInt(100000, 999999).toString();
  codes.set(ip, {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  });
  return code;
}

export function verifyCode(ip: string, input: string): boolean {
  cleanup(Date.now());
  const entry = codes.get(ip);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    codes.delete(ip);
    return false;
  }

  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) {
    codes.delete(ip);
    return false;
  }

  if (entry.code === input) {
    codes.delete(ip);
    return true;
  }

  return false;
}
