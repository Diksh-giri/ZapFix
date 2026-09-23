/** Before-and-after of ONE field (Decision #006). Labels, not color, distinguish the two values. */
export function DiffView({ field, current, proposed }: { field: string; current: string; proposed: string }) {
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-neutral-600">Field</dt>
      <dd>{field}</dd>
      <dt className="text-neutral-600">Current</dt>
      <dd className="font-mono">{current}</dd>
      <dt className="text-neutral-600">Proposed</dt>
      <dd className="font-mono">{proposed}</dd>
    </dl>
  );
}
