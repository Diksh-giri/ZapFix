import { cn } from "cn";

const styles = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-300 bg-red-50 text-red-800",
  active: "border-blue-300 bg-blue-50 text-blue-800",
} as const;

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: keyof typeof styles }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", styles[tone])}>{label}</span>;
}
