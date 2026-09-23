import type { Confidence } from "@/lib/types";

const LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

/** Decision #028: a label plus a one-line reason, never a percentage. Text carries the meaning, not color. */
export function ConfidenceBadge({ level, reason }: { level: Confidence; reason: string }) {
  return (
    <p className="text-sm">
      <span className="rounded border px-2 py-0.5 font-medium">Confidence: {LABEL[level]}</span>{" "}
      <span className="text-neutral-600">{reason}</span>
    </p>
  );
}
