import { ContainerDetailWorkspace } from "@/components/containers/container-detail-workspace";

export default async function ContainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContainerDetailWorkspace containerId={id} />;
}
