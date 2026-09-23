import type { Evidence } from "@/server/diagnosis/rules/types";

/** System-confirmed facts. Keep visually separate from AI-written text (PRD R2.8). */
export function EvidenceList({ items }: { items: Evidence[] }) {
  return (
    <section aria-label="Confirmed by the system">
      <h3 className="text-sm font-medium">Confirmed by the system</h3>
      <ul className="mt-1 space-y-1 text-sm">
        {items.map((e) => (
          <li key={e.label}>
            <span className="text-neutral-600">{e.label}: </span>
            {e.value}
          </li>
        ))}
      </ul>
    </section>
  );
}
