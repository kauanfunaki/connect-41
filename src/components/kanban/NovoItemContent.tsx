import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { ItemForm } from "@/components/kanban/ItemForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarItem } from "@/app/(app)/kanban/actions";
import { NovoItemModal } from "@/components/kanban/NovoItemModal";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { accessiblePipelineWhere, scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorUsers } from "@/lib/sectorUsers";
import { getSectorMaps } from "@/lib/sectors";
import { trilhaDaLista } from "@/lib/kanbanPaths";
import { CAMPOS_DA_EMPRESA_NO_SELETOR, opcoesDeEmpresa } from "@/lib/empresas/opcoesDoSeletor";
import { nomeExibicao } from "@/lib/companyName";
import type { Opcao } from "@/components/shared/SearchableSelect";

export async function NovoItemContent({ id, estagio, emModal = false }: { id: string; estagio?: string; emModal?: boolean }) {
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({
    where: { id, ...accessiblePipelineWhere(ctx) },
    include: {
      stages: { orderBy: { order: "asc" } },
      // Para a trilha da página cheia (setor › espaço › pasta › lista).
      space: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
    },
  });
  if (!pipeline) notFound();
  if (!canManageSector(ctx, pipeline.sectorCode)) notFound();

  // As opções já no desenho do seletor com busca (15/10/2026): empresa com
  // logo, CNPJ, a filial embaixo da matriz e recentes; pessoa com a foto.
  const entities: Opcao[] =
    pipeline.entityType === "COMPANY"
      ? opcoesDeEmpresa(
          (
            await prisma.company.findMany({
              where: await scopedCompanyWhere(ctx),
              orderBy: { name: "asc" },
              select: CAMPOS_DA_EMPRESA_NO_SELETOR,
            })
          ).map((c) => ({ ...c, nome: nomeExibicao(c) }))
        )
      : (
          await prisma.person.findMany({
            where: await scopedPersonWhere(ctx),
            orderBy: { name: "asc" },
            select: { id: true, name: true, photoUrl: true },
          })
        ).map((p) => ({ value: p.id, label: p.name, imagem: p.photoUrl }));

  const [tags, sectorUsers] = await Promise.all([
    prisma.tag.findMany({
      where: { tenantId: ctx.tenantId, sectorCode: pipeline.sectorCode },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    getSectorUsers(ctx.tenantId, pipeline.sectorCode),
  ]);

  const formulario = (
    <ItemForm
      action={criarItem}
      emModal={emModal}
      pipelineId={id}
      stages={pipeline.stages}
      initialStageId={pipeline.stages.some((s) => s.id === estagio) ? estagio : undefined}
      entityType={pipeline.entityType}
      entities={entities}
      tags={tags}
      sectorUsers={sectorUsers}
      cancelHref={`/kanban/${id}`}
    />
  );
  if (emModal) return <NovoItemModal>{formulario}</NovoItemModal>;
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
  return (
    <PageContainer>
      {/* No caminho que a lista mostra, e não a partir de "Kanban" (P04, 15/10/2026). */}
      <Breadcrumb
        items={[...trilhaDaLista(pipeline, sectorLabels[pipeline.sectorCode] ?? pipeline.sectorCode), { label: "Nova tarefa" }]}
      />
      <PageHeader title="Nova tarefa" />

      {/* No cartão de 720px dos formulários curtos (30/09): na largura da
          tela, o select da empresa ia de uma borda à outra. */}
      <Card className="p-6 w-full max-w-[720px]">
        {formulario}
      </Card>
    </PageContainer>
  );
}
