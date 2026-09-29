import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-5">
      <div className="max-w-2xl">
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
