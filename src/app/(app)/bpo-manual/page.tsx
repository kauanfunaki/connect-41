import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { ManualWorkspace } from "@/components/bpoManual/ManualWorkspace";
import {
  criarDocumentoManual,
  renomearDocumentoManual,
  excluirDocumentoManual,
  atualizarIconeDocumento,
  criarPaginaManual,
  atualizarPaginaManual,
  excluirPaginaManual,
} from "./actions";

const SECTOR = "bpo";

// Manual/Instruções internas do BPO — biblioteca em dois níveis (Documento >
// Página) escrita pelos próprios colaboradores (não upload de arquivo) pra
// alinhamento em caso de ausência/férias de alguém. Módulo próprio, ao lado
// dos Espaços do setor em /setor/bpo e de /bpo-senhas (Repositório de Senhas).
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

  // Altura fechada, sem rolagem de página: o cabeçalho fica fixo e o workspace
  // ocupa exatamente o que sobra. Antes o card tinha altura própria (78vh) que,
  // somada ao cabeçalho e ao padding, estourava a viewport e criava uma segunda
  // barra de rolagem — a da página inteira — por cima das rolagens internas da
  // árvore de documentos e do canvas. Mesmo padrão do quadro de Kanban.
  return (
    <PageContainer className="h-full flex flex-col">
      <BackButton className="mb-3 flex-shrink-0" />

      <div className="mb-6 flex-shrink-0">
      <PageHeader title="Repositório de Manuais" />
        <p className="text-[13px] text-fg-muted mt-1">
          Instruções internas do setor — escritas pelos colaboradores para alinhamento em ausências e férias.
        </p>
      </div>

      {/* flex-1 min-h-0 é o que dá ao workspace uma altura definida igual ao
          espaço restante — sem o min-h-0 o filho rolável estoura o container
          em vez de rolar por dentro. */}
      <div className="flex-1 min-h-0">
        <ManualWorkspace
          canAct={canAct}
          canDelete={canDelete}
          documents={documents.map((d) => ({
            id: d.id,
            title: d.title,
            icon: d.icon,
            pages: d.pages.map((p) => ({
              id: p.id,
              title: p.title,
              content: p.content,
              coverImageUrl: p.coverImageUrl,
              createdByName: p.createdBy.name,
              updatedAt: p.updatedAt.toISOString(),
            })),
          }))}
          createDocumentAction={criarDocumentoManual}
          renameDocumentAction={renomearDocumentoManual}
          deleteDocumentAction={excluirDocumentoManual}
          updateDocumentIconAction={atualizarIconeDocumento}
          createPageAction={criarPaginaManual}
          updatePageAction={atualizarPaginaManual}
          deletePageAction={excluirPaginaManual}
        />
      </div>
    </PageContainer>
  );
}
