import { ContainerLogsWorkspace } from "@/components/logs/container-logs-workspace";

export default async function LogsPage({ searchParams }: PageProps<"/logs">) {
  const params = await searchParams;
  const container = typeof params.container === "string" ? params.container : "";
  return <ContainerLogsWorkspace initialContainerId={container} />;
}
