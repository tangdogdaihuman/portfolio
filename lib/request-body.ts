import type { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/api-response";

type JsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse };

export async function readJsonBody(req: NextRequest): Promise<JsonBodyResult> {
  try {
    return { ok: true, data: await req.json() };
  } catch {
    return { ok: false, response: fail("BAD_REQUEST", "Invalid JSON body", 400) };
  }
}
