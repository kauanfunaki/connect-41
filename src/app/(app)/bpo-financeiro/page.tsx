import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewSpaceButton } from "@/components/kanban/NewSpaceButton";
import { criarEspaco } from "@/app/(app)/kanban/spaces-actions";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector, canViewSector } from "@/lib/auth/context";

// Home do módulo dedicado do BPO Financeiro — agora navega por Espaço, não
// lista Pipelines direto (estrutura Espaço → Pasta → Lista). Se só existe 1
// espaço no setor, pula direto pra ele.
export default async function BpoFinanceiroHomePage() {
  const ctx = await getAuthContext();
  // Checagem explícita em vez de `{ ...scopedSpaceWhere(ctx), sectorCode: "bpo" }`:
  // o "bpo" literal por último sobrescrevia a chave sectorCode de
  // scopedSpaceWhere, derrubando o filtro `{in: ctx.sectors}` — qualquer
  // usuário autenticado do tenant via essa listagem, mesmo sem fazer parte
  // do setor bpo (ver mesmo bug corrigido nos outros arquivos deste módulo).
  if (!canViewSector(ctx, "bpo")) notFound();

  const prisma = getPrisma();
  const spaces = await prisma.space.findMany({
    where: { tenantId: ctx.tenantId, sectorCode: "bpo" },
    orderBy: { order: "asc" },
    include: { _count: { select: { pipelines: true, folders: true } } },
  });

  if (spaces.length === 1) {
    redirect(`/bpo-financeiro/espacos/${spaces[0].id}`);
  }

  const canCreate = canManageSector(ctx, "bpo");
  const createSpaceAction = criarEspaco.bind(null, "bpo");

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">BPO Financeiro</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            Espaços do setor — cada um agrupa pastas e listas de clientes/processos.
          </p>
        </div>
        {canCreate && <NewSpaceButton action={createSpaceAction} />}
      </div>

      {spaces.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl">
          <EmptyState
            icon={<LayoutGrid />}
            title="Nenhum espaço criado ainda"
            description="Um espaço agrupa pastas e listas — ex.: um espaço por grande cliente ou por linha de trabalho."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {spaces.map((s, i) => (
            <Link
              key={s.id}
              href={`/bpo-financeiro/espacos/${s.id}`}
              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              className="reveal-in bg-surface border border-border rounded-lg p-4 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: s.color }} />
                <p className="text-[13px] font-medium text-fg">{s.name}</p>
              </div>
              <p className="text-[12px] text-fg-muted">
                {s._count.folders} {s._count.folders === 1 ? "pasta" : "pastas"} · {s._count.pipelines} {s._count.pipelines === 1 ? "lista" : "listas"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
