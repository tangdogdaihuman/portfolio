import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { countR2DeleteJobs, processR2DeleteJobs } from "@/lib/r2-delete-jobs";
import { pruneRetentionTables } from "@/lib/retention";

const R2_DELETE_BATCH = 20;

export async function POST(req: NextRequest) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  let r2Failure: string | null = null;
  let result = { processed: 0, succeeded: 0, failed: 0 };
  try {
    result = await processR2DeleteJobs(R2_DELETE_BATCH);
  } catch (error) {
    r2Failure = error instanceof Error ? error.message : "unknown";
  }

  const retention = await pruneRetentionTables();
  const pending = await countR2DeleteJobs().catch(() => null);
  const payload = {
    triggeredAt: new Date().toISOString(),
    ...result,
    pending,
    retention,
  };

  if (r2Failure) {
    return fail("SERVER_ERROR", `R2 cleanup failed: ${r2Failure}`, 500, payload);
  }

  return ok(payload);
}
