import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { ItemForm } from "@/components/pipelines/ItemForm";
import { criarItem } from "../../../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedPipelineWhere, scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";

export default async function NovoItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id, ...scopedPipelineWhere(ctx) } });
  if (!pipeline) notFound();
  if (!canManageSector(ctx, pipeline.sectorCode)) notFound();

  const entities =
    pipeline.entityType === "COMPANY"
      ? await prisma.company.findMany({
          where: await scopedCompanyWhere(ctx),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : await prisma.person.findMany({
          where: await scopedPersonWhere(ctx),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pipelines" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pipelines
        </Link>
        <span className="text-fg-muted">/</span>
        <Link
          href={`/pipelines/${id}`}
          className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]"
        >
          {pipeline.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Item</span>
      </div>

      <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em] mb-6">
        Adicionar {pipeline.entityType === "COMPANY" ? "Empresa" : "Pessoa"} ao Pipeline
      </h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <ItemForm
          action={criarItem}
          pipelineId={id}
          entityType={pipeline.entityType}
          entities={entities}
          cancelHref={`/pipelines/${id}`}
        />
      </div>
    </div>
  );
}
