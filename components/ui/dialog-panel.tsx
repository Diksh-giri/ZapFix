"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export function trappedFocusIndex(activeIndex: number, controlCount: number, shiftKey: boolean): number | null {
  if (controlCount === 0) return null;
  if (activeIndex === -1) return shiftKey ? controlCount - 1 : 0;
  if (shiftKey && activeIndex === 0) return controlCount - 1;
  if (!shiftKey && activeIndex === controlCount - 1) return 0;
  return null;
}

export function DialogPanel({ titleId, descriptionId, title, children, actions, onDismiss, returnFocusRef }: { titleId: string; descriptionId: string; title: string; children?: ReactNode; actions: ReactNode; onDismiss?: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      const fallback = previouslyFocused;
      // Read the shared ref after the trigger remounts; the pre-dialog node no longer exists.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      queueMicrotask(() => (returnFocusRef?.current ?? fallback)?.focus());
    };
  }, [returnFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && onDismiss) { event.preventDefault(); onDismiss(); return; }
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!controls?.length) { event.preventDefault(); return; }
    const activeIndex = document.activeElement === dialogRef.current
      ? -1
      : Array.from(controls).findIndex((control) => control === document.activeElement);
    const nextIndex = trappedFocusIndex(activeIndex, controls.length, event.shiftKey);
    if (nextIndex !== null) { event.preventDefault(); controls[nextIndex]!.focus(); }
  }
  return (
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="rounded-lg border-2 border-neutral-900 bg-white p-4 shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-neutral-400">
      <h4 id={titleId} className="font-semibold text-neutral-950">{title}</h4>
      <div id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-600">{children}</div>
      <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
