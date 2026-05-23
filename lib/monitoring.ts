type ErrorPayload = {
  scope: string;
  message: string;
  path?: string;
  meta?: Record<string, unknown>;
};

type MetricPayload = {
  scope: string;
  value: number;
  path?: string;
  meta?: Record<string, unknown>;
};

function emit(kind: "error" | "metric", payload: ErrorPayload | MetricPayload) {
  const event = {
    kind,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  if (kind === "error") {
    console.error("[monitor]", JSON.stringify(event));
  } else {
    console.log("[monitor]", JSON.stringify(event));
  }

  const webhook = process.env.MONITORING_WEBHOOK_URL;
  if (!webhook) return;

  fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    cache: "no-store",
  }).catch(() => {});
}

export function reportApiError(payload: ErrorPayload) {
  emit("error", payload);
}

export function reportMetric(payload: MetricPayload) {
  emit("metric", payload);
}

