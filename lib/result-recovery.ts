import type { RunView } from "@/lib/schemas/runs";
import type { StandardError } from "@/lib/schemas/standard-error";
import type { FieldMapping } from "@/lib/schemas/workflow-config";

export type RetryOutcome = "resolved" | "same_error" | "new_error" | "running";

function latestError(view: RunView): StandardError | undefined {
  return [...view.attempts].sort((a, b) => b.attemptNo - a.attemptNo).find((attempt) => attempt.errorStd)?.errorStd;
}

export function classifyRetryOutcome(original: RunView, retried: RunView): RetryOutcome {
  const latest = retried.attempts.reduce((current, attempt) =>
    !current || attempt.attemptNo > current.attemptNo ? attempt : current, undefined as RunView["attempts"][number] | undefined);
  if (!latest || latest.status === "running") return "running";
  if (latest.status === "succeeded") return "resolved";

  const before = latestError(original);
  const after = latest.errorStd;
  if (before && after && before.code === after.code && before.category_hint === after.category_hint && before.field === after.field) {
    return "same_error";
  }
  return "new_error";
}

export function describeResultValue(value: FieldMapping | null): string {
  if (!value) return "No value";
  if (value.kind === "static") return value.value === "" ? "Empty fixed value" : `Fixed value: ${value.value}`;
  const transform = value.transform?.kind;
  if (!transform) return `Form field: ${value.source}`;
  return `Form field: ${value.source} (${transform.replaceAll("_", " ")})`;
}
