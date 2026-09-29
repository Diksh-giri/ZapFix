import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Inbox, LoaderCircle } from "lucide-react";

const icons = { loading: LoaderCircle, empty: Inbox, error: CircleAlert, success: CheckCircle2 } as const;
const styles = {
  loading: "border-neutral-200 bg-neutral-50 text-neutral-700",
  empty: "border-dashed border-neutral-300 bg-white text-neutral-700",
  error: "border-red-200 bg-red-50 text-red-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
} as const;

export function StatePanel({ state, title, description, action, compact = false }: { state: keyof typeof icons; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  const Icon = icons[state];
  return (
    <section role={state === "error" ? "alert" : "status"} aria-live={state === "error" ? "assertive" : "polite"} className={`rounded-xl border text-center ${styles[state]} ${compact ? "p-4" : "px-5 py-8"}`}>
      <Icon aria-hidden="true" className={`mx-auto size-6 ${state === "loading" ? "animate-spin" : ""}`} />
      <h2 className="mt-3 font-semibold">{title}</h2>
      {description ? <p className="mx-auto mt-1 max-w-lg text-sm leading-6 opacity-80">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}
