"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

export function DialogPanel({ titleId, descriptionId, title, children, actions, onDismiss }: { titleId: string; descriptionId: string; title: string; children?: ReactNode; actions: ReactNode; onDismiss?: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && onDismiss) { event.preventDefault(); onDismiss(); return; }
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!controls?.length) { event.preventDefault(); return; }
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return (
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="rounded-lg border-2 border-neutral-900 bg-white p-4 shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-neutral-400">
      <h4 id={titleId} className="font-semibold text-neutral-950">{title}</h4>
      <div id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-600">{children}</div>
      <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
