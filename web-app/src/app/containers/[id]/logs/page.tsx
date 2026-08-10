import { ContainerLogsWorkspace } from "@/components/logs/container-logs-workspace";

export default async function ContainerLogsPage({ params }: PageProps<"/containers/[id]/logs">) {
  const { id } = await params;
  return <ContainerLogsWorkspace containerId={id} />;
}
