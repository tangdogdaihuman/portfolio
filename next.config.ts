import type { NextConfig } from "next";
import { execSync } from "child_process";

function getCommitCount() {
  try {
    return execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "0";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: getCommitCount(),
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
    ],
  },
};

export default nextConfig;
