import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { ManualWorkspace } from "@/components/bpoManual/ManualWorkspace";
import {
  criarDocumentoManual,
  renomearDocumentoManual,
  excluirDocumentoManual,
  criarPaginaManual,
  atualizarPaginaManual,
  excluirPaginaManual,
} from "./actions";

const SECTOR = "bpo";

// Manual/Instruções internas do BPO — biblioteca em dois níveis (Documento >
// Página) escrita pelos próprios colaboradores (não upload de arquivo) pra
// alinhamento em caso de ausência/férias de alguém. Módulo próprio, ao lado
// de /bpo-financeiro (Tarefas do BPO) e /bpo-senhas (Repositório de Senhas).
export default async function BpoManualPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
  const canAct = canActOnSector(ctx, SECTOR);
  const canDelete = canManageSector(ctx, SECTOR);

  const prisma = getPrisma();
  const documents = await prisma.manualDocument.findMany({
    where: { tenantId: ctx.tenantId, sectorCode: SECTOR },
    orderBy: { createdAt: "asc" },
    include: { pages: { orderBy: { order: "asc" }, include: { createdBy: { select: { name: true } } } } },
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

      <ManualWorkspace
        canAct={canAct}
        canDelete={canDelete}
        documents={documents.map((d) => ({
          id: d.id,
          title: d.title,
          pages: d.pages.map((p) => ({ id: p.id, title: p.title, content: p.content, createdByName: p.createdBy.name })),
        }))}
        createDocumentAction={criarDocumentoManual}
        renameDocumentAction={renomearDocumentoManual}
        deleteDocumentAction={excluirDocumentoManual}
        createPageAction={criarPaginaManual}
        updatePageAction={atualizarPaginaManual}
        deletePageAction={excluirPaginaManual}
      />
    </PageContainer>
  );
}
