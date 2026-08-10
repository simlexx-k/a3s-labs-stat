import { redirect } from "next/navigation";

export default async function ContainerLogsPage({ params }: PageProps<"/containers/[id]/logs">) {
  const { id } = await params;
  redirect(`/logs?container=${encodeURIComponent(id)}`);
}
