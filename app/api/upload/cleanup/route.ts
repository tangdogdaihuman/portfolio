import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { enqueueR2Delete, processR2DeleteJobs } from "@/lib/r2-delete-jobs";
import { readJsonBody } from "@/lib/request-body";

const cleanupSchema = z.object({
  urls: z.array(z.string().url()).max(50),
});

export async function POST(req: NextRequest) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;
  await processR2DeleteJobs().catch(() => {});

  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = cleanupSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("BAD_REQUEST", "Invalid cleanup payload", 400, parsed.error.flatten());
  }

  await enqueueR2Delete(parsed.data.urls);
  return ok({ cleaned: parsed.data.urls.length });
}

