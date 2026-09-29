import type { ReactNode } from "react";

export function DialogPanel({ titleId, descriptionId, title, children, actions }: { titleId: string; descriptionId: string; title: string; children?: ReactNode; actions: ReactNode }) {
  return (
    <div role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} className="rounded-lg border-2 border-neutral-900 bg-white p-4 shadow-lg">
      <h4 id={titleId} className="font-semibold text-neutral-950">{title}</h4>
      <div id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-600">{children}</div>
      <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
