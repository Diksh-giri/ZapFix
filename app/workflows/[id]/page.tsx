import { WorkflowEditor } from "@/components/WorkflowEditor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkflowEditor workflowId={id} />;
}
