import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "cn";

export function Surface({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)} {...props} />;
}

export function SurfaceHeader({ title, description, aside }: { title: string; description?: string; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-neutral-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-neutral-600">{description}</p> : null}
      </div>
      {aside}
    </div>
  );
}
