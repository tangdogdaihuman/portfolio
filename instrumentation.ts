const STARTUP_BUDGET_MS = 8000;

type StartupOutcome = "ready" | "failed" | "deferred";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function warmDatabase(): Promise<StartupOutcome> {
  const { initializeDb } = await import("@/lib/db");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<StartupOutcome>((resolve) => {
    timer = setTimeout(() => resolve("deferred"), STARTUP_BUDGET_MS);
  });
  const work = initializeDb()
    .then((): StartupOutcome => "ready")
    .catch((error: unknown): StartupOutcome => {
      console.error("[instrumentation] database migration failed", { message: describeError(error) });
      return "failed";
    });

  try {
    return await Promise.race([work, budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) {
    console.warn("[instrumentation] DATABASE_URL is not set, skipping database warm-up");
    return;
  }

  const startedAt = Date.now();
  const outcome = await warmDatabase();
  console.log("[instrumentation] database warm-up", {
    outcome,
    elapsedMs: Date.now() - startedAt,
    mode: process.env.NODE_ENV ?? "unknown",
  });
}
