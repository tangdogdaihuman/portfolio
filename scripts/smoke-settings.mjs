const DEFAULT_LOCAL_BASE_URL = "http://localhost:3000";
const DEFAULT_PRODUCTION_BASE_URL = "https://tangzihang.top";

function getArgValue(argv, name) {
  const prefix = `${name}=`;
  const found = argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalBaseUrl(baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function resolveSmokeSettings({ argv = process.argv, env = process.env } = {}) {
  const productionMode = argv.includes("--prod");
  const baseUrl = normalizeBaseUrl(
    getArgValue(argv, "--base-url") ||
      env.SMOKE_BASE_URL ||
      env.BASE_URL ||
      (productionMode ? env.NEXT_PUBLIC_BASE_URL || DEFAULT_PRODUCTION_BASE_URL : env.NEXT_PUBLIC_BASE_URL || DEFAULT_LOCAL_BASE_URL)
  );
  const adminKey = env.ADMIN_KEY || env.ADMIN_SECRET_KEY || "";
  const localTarget = isLocalBaseUrl(baseUrl);

  return {
    baseUrl,
    adminKey,
    checkRateLimit: env.CHECK_RATE_LIMIT === "1",
    allowAdminWrites: localTarget || env.SMOKE_ALLOW_WRITES === "1",
    productionMode,
    localTarget,
  };
}
