import { NovoItemContent } from "@/components/kanban/NovoItemContent";

export default async function NovoItemModalRoute({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estagio?: string }>;
}) {
  const { id } = await params;
  const { estagio } = await searchParams;
  return <NovoItemContent id={id} estagio={estagio} emModal />;
}
