export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Workflow editor and run detail</h1>
      <p className="text-neutral-600">Workflow {id}. Not built yet (T17, T18, T19). See docs/TDD.md section 11.</p>
    </div>
  );
}
