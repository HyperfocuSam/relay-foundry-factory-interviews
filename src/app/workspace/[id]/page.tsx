import { SessionWorkspace } from "@/components/workspace/session-workspace";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  return (
    <SessionWorkspace
      id={id}
      view={view === "review" || view === "next-steps" ? view : "interview"}
    />
  );
}
