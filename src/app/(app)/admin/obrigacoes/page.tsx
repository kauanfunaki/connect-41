import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddObrigacaoForm } from "@/components/admin/AddObrigacaoForm";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { ToggleObrigacaoButton } from "@/components/admin/ToggleObrigacaoButton";
import { criarObrigacao, alternarObrigacao, excluirObrigacao } from "./actions";

export default async function ObrigacoesPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const { labels } = await getSectorMaps(ctx.tenantId);

  const [obligations, companies, pipelines, users] = await Promise.all([
    prisma.recurringObligation.findMany({
      where: { tenantId: ctx.tenantId },
      include: { company: { select: { name: true } }, responsible: { select: { name: true } }, pipeline: { select: { name: true } } },
      orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }, { title: "asc" }],
    }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { not: "CHURNED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.pipeline.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      select: { id: true, name: true, sectorCode: true },
      orderBy: [{ sectorCode: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Obrigações Recorrentes</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          DAS, DCTF, folha e afins — todo mês o Connect gera automaticamente o item de kanban
          da obrigação, com vencimento prorrogado para o próximo dia útil.
        </p>
      </div>

      <AddObrigacaoForm
        action={criarObrigacao}
        companies={companies}
        pipelines={pipelines.map((p) => ({ ...p, sectorLabel: sectorLabel(labels, p.sectorCode) }))}
        users={users}
      />

      {obligations.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState title="Nenhuma obrigação recorrente cadastrada ainda." />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {obligations.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] text-fg font-medium truncate">
                  {o.title}
                  {!o.active && <span className="ml-2 text-[11px] font-normal text-fg-muted">(inativa)</span>}
                </p>
                <p className="text-[11px] text-fg-muted mt-0.5 truncate">
                  {o.company.name} · {sectorLabel(labels, o.sectorCode)} · kanban {o.pipeline.name} · dia {o.dayOfMonth}
                  {o.responsible ? ` · ${o.responsible.name}` : " · notifica o setor"}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <ToggleObrigacaoButton action={alternarObrigacao.bind(null, o.id)} ativo={o.active} nome={o.title} />
                <DeleteFieldButton action={excluirObrigacao.bind(null, o.id)} nome={o.title} />
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
