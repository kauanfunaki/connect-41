import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
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
import { setorDoModulo } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "bpo";
const MODULE = "bpo_manual";

// Manual/Instruções internas do BPO — biblioteca em dois níveis (Documento >
// Página) escrita pelos próprios colaboradores (não upload de arquivo) pra
// alinhamento em caso de ausência/férias de alguém. Módulo próprio, ao lado
// dos Espaços do setor em /setor/bpo e de /bpo-senhas (Repositório de Senhas).
export default async function BpoManualPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canActOnSector(ctx, setor)) notFound();
  const canAct = canActOnSector(ctx, setor);
  const canDelete = canManageSector(ctx, setor);
  // O vazio cita quem coordena o setor que opera o módulo, e não "o BPO" (05/10/2026).
  const setorRotulo = sectorLabel((await getSectorMaps(ctx.tenantId)).labels, setor);

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
      {/* Sem "Voltar" (08/10/2026): é página principal do setor, aberta pelo
          menu — a regra de contas a pagar. */}

      {/* Subtítulo no próprio PageHeader (30/09) — estava escrito à parte, com
          o cabeçalho aninhado num bloco com margem própria. */}
      <div className="flex-shrink-0">
        <PageHeader
          title="Repositório de Manuais"
          subtitle="Instruções internas do setor — escritas pelos colaboradores para alinhamento em ausências e férias."
        />
      </div>

      {/* flex-1 min-h-0 é o que dá ao workspace uma altura definida igual ao
          espaço restante — sem o min-h-0 o filho rolável estoura o container
          em vez de rolar por dentro. */}
      <div className="flex-1 min-h-0">
        <ManualWorkspace
          canAct={canAct}
          canDelete={canDelete}
          setorRotulo={setorRotulo}
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
