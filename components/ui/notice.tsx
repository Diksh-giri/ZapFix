import type { ReactNode } from "react";
import { cn } from "cn";

const styles = {
  info: "border-blue-200 bg-blue-50 text-blue-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-red-200 bg-red-50 text-red-950",
} as const;

const labels = { info: "Information", success: "Success", warning: "Important", error: "Error" } as const;

export function Notice({ tone = "info", title, children, className }: { tone?: keyof typeof styles; title?: string; children?: ReactNode; className?: string }) {
  const heading = title ?? labels[tone];
  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", styles[tone], className)} role={tone === "error" ? "alert" : "status"}>
      <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
        {tone === "success" ? "✓" : tone === "error" ? "!" : tone === "warning" ? "!" : "i"}
      </span>
      <div className="min-w-0 leading-5"><strong className="block font-semibold">{heading}</strong>{children}</div>
    </div>
  );
}
