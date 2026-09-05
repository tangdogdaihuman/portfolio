const OBJECT_PREFIXES = ["originals/", "thumbnails/"];

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function configuredPublicOrigin(): string | null {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isOwnHost(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  if (lowered.endsWith(".r2.dev") || lowered.endsWith(".r2.cloudflarestorage.com")) return true;
  const base = configuredPublicOrigin();
  if (base) {
    try {
      if (new URL(base).hostname.toLowerCase() === lowered) return true;
    } catch {
      return false;
    }
  }
  const alt = process.env.R2_ALT_PUBLIC_URLS;
  if (!alt) return false;
  return alt
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      try {
        return new URL(entry).hostname.toLowerCase() === lowered;
      } catch {
        return false;
      }
    });
}

function parseOwnUrl(url: string): { origin: string; key: string } | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const path = parsed.pathname.replace(/^\/+/, "");
  if (!OBJECT_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  if (!isOwnHost(parsed.hostname)) return null;
  return { origin: parsed.origin, key: path };
}

export function mediaUrlToKey(url: string): string | null {
  return parseOwnUrl(url)?.key ?? null;
}

export function normalizeMediaUrl(url: string): string {
  const parsed = parseOwnUrl(url);
  if (!parsed) return url;
  const base = configuredPublicOrigin();
  if (!base || base === parsed.origin) return url;
  return `${base}/${parsed.key}`;
}
