import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canManageSector, canActOnSector, podeExcluir } from "@/lib/auth/context";
import { ManualWorkspace } from "@/components/bpoManual/ManualWorkspace";
import { NovoDocumento } from "@/components/bpoManual/NovoDocumento";
import {
  criarDocumentoManual,
  renomearDocumentoManual,
  excluirDocumentoManual,
  atualizarIconeDocumento,
  criarPaginaManual,
  atualizarPaginaManual,
  excluirPaginaManual,
} from "./actions";
import { isModuleEnabled } from "@/lib/modules";
import { setorDaTelaDoApoio } from "@/lib/apoio/servidor";
import { SeletorDoSetorDoApoio } from "@/components/apoio/SeletorDoSetorDoApoio";

const MODULE = "bpo_manual";

// Manual/Instruções internas do setor — biblioteca em dois níveis (Documento >
// Página) escrita pelos próprios colaboradores (não upload de arquivo) pra
// alinhamento em caso de ausência/férias de alguém. No Apoio, ao lado dos
// Quadros e de /senhas (Repositório de senhas).
//
// Apoio de todo setor desde 05/11/2026: cada setor tem os seus manuais
// (`ManualDocument.sectorCode`); o setor é o da pessoa — ver `setorDaTelaDoApoio`.
export default async function ManuaisPage({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const [{ setor: pedido }, ligado] = await Promise.all([searchParams, isModuleEnabled(ctx.tenantId, MODULE)]);
  if (!ligado) notFound();
  const apoio = await setorDaTelaDoApoio(ctx, pedido);
  if (!apoio) notFound();
  const canAct = canActOnSector(ctx, apoio.setor);
  // Excluir documento, página e capa do manual: só o administrador (13/10/2026).
  const canDelete = canManageSector(ctx, apoio.setor) && podeExcluir(ctx);
  // O vazio cita quem coordena o setor da tela (05/10/2026).
  const setorRotulo = apoio.rotulo;

  const prisma = getPrisma();
  const documents = await prisma.manualDocument.findMany({
    where: { tenantId: ctx.tenantId, sectorCode: apoio.setor },
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
        {/* O "+ Nova pasta" foi para o pé da coluna de pastas (lote C de 03/11/2026). */}
        <PageHeader
          title="Repositório de manuais"
          subtitle={`As instruções de ${apoio.rotulo}, escritas pela equipe para quem cobre ausências e férias.`}
        />
        <SeletorDoSetorDoApoio apoio={apoio} caminho="/manuais" />
      </div>

      {/* flex-1 min-h-0 é o que dá ao workspace uma altura definida igual ao
          espaço restante — sem o min-h-0 o filho rolável estoura o container
          em vez de rolar por dentro. */}
      <div className="flex-1 min-h-0">
        <ManualWorkspace
          rodapeDaArvore={canAct ? <NovoDocumento action={criarDocumentoManual.bind(null, apoio.setor)} /> : undefined}
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
