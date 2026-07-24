import { cookies } from "next/headers";
import { ok } from "@/lib/api-response";

const COOKIE_NAME = "admin_token";

export async function POST() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  });
  return ok({ loggedOut: true });
}
