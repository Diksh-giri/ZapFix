const STEPS = ["Build", "Run", "Diagnose", "Approve", "Retry or restore"] as const;

export function RecoveryJourney({ current }: { current: (typeof STEPS)[number] }) {
  const currentIndex = STEPS.indexOf(current);
  return (
    <nav aria-label="Recovery journey" className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">Your recovery journey</p>
      <ol className="grid gap-2 sm:grid-cols-5">
        {STEPS.map((step, index) => {
          const state = index < currentIndex ? "Complete" : index === currentIndex ? "Current" : "Next";
          return (
            <li key={step} aria-current={index === currentIndex ? "step" : undefined} className="flex items-center gap-2 sm:block">
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${index <= currentIndex ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300 bg-white text-neutral-500"}`}>
                {index < currentIndex ? "✓" : index + 1}
              </span>
              <span className="sm:mt-2 sm:block"><span className="block text-sm font-medium text-neutral-900">{step}</span><span className="block text-xs text-neutral-500">{state}</span></span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
