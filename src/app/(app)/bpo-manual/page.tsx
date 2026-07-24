import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { ManualPagesPanel } from "@/components/bpoManual/ManualPagesPanel";
import { criarPaginaManual, atualizarPaginaManual, excluirPaginaManual } from "./actions";

const SECTOR = "bpo";

// Manual/Instruções internas do BPO — biblioteca de páginas escritas pelos
// próprios colaboradores (não upload de arquivo) pra alinhamento em caso de
// ausência/férias de alguém. Módulo próprio, ao lado de /bpo-financeiro
// (Tarefas do BPO) e /bpo-senhas (Repositório de Senhas) — antes vivia dentro
// do detalhamento de cada tarefa do Kanban (CanvasModal), removido de lá em
// 2026-07-24 por ser difícil de localizar depois de criado.
export default async function BpoManualPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
  const canAct = canActOnSector(ctx, SECTOR);
  const canDelete = canManageSector(ctx, SECTOR);

  const prisma = getPrisma();
  const pages = await prisma.canvasPage.findMany({
    where: { tenantId: ctx.tenantId, sectorCode: SECTOR },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <PageContainer>
      <BackButton className="mb-3" />

      <div className="mb-6">
        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">Manual</h1>
        <p className="text-[13px] text-fg-muted mt-1">
          Instruções internas do setor — escritas pelos colaboradores para alinhamento em ausências e férias.
        </p>
      </div>

      <ManualPagesPanel
        canAct={canAct}
        canDelete={canDelete}
        pages={pages.map((p) => ({ id: p.id, title: p.title, content: p.content, createdByName: p.createdBy.name }))}
        createAction={criarPaginaManual}
        updateAction={atualizarPaginaManual}
        deleteAction={excluirPaginaManual}
      />
    </PageContainer>
  );
}
