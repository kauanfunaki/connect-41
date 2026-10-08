import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getPortalSession } from "@/lib/auth/portal";
import { alcanceDoCliente } from "@/app/(portal)/alcance";
import { listarDocumentos, competenciasDisponiveis } from "@/lib/fiscal/data";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { PortalDocumentosTable, PaginacaoDosDocumentos } from "@/components/portal/PortalDocumentosTable";
import { PortalCompetenciaFiltro } from "@/components/portal/PortalCompetenciaFiltro";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";

// Acervo fiscal visto pelo cliente. **Só leitura**, e por construção: não há
// entrada de XML nem decisão de destino aqui, e as actions que fazem essas
// coisas exigem setor interno — que nenhuma sessão de portal tem.
//
// Era a home do portal (`/portal`) até 05/10, quando ganhou rota própria e o
// Início entrou no lugar: uma lista de até 252 mil documentos não é porta de
// entrada. Os avisos e o botão de notificações foram junto para o Início; link
// antigo com competência ou página chega aqui pelo redirecionamento de lá.
export default async function PortalDocumentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sessao = await getPortalSession();
  if (!sessao) redirect("/portal/login");

  const params = await searchParams;
  const alcance = await alcanceDoCliente(sessao);
  const pagina = Math.max(1, Number(params.pagina) || 1);
  // A empresa escolhida no Início vem junto (05/10) — e só vale se for do grupo.
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  const empresaId = params.empresa && companyIds.includes(params.empresa) ? params.empresa : undefined;
  const filtro = { competencia: params.competencia || undefined, companyId: empresaId };

  const [{ documentos, total, totalLimitado, temProxima, porPagina }, competencias, empresas] = await Promise.all([
    listarDocumentos(alcance, filtro, pagina),
    competenciasDisponiveis(empresaId ? { tipo: "EMPRESAS", tenantId: sessao.tenantId, companyIds: [empresaId] } : alcance),
    companyIds.length > 1 ? empresasDoSeletor(sessao.tenantId, companyIds) : Promise.resolve([]),
  ]);

  return (
    <PageContainer>
      <PortalCabecalho titulo="Documentos fiscais" descricao="Notas emitidas e recebidas pelas suas empresas." />

      {total === 0 && !params.competencia && !empresaId ? (
        <Card>
          <EmptyState
            icon={<FileText />}
            title="Nenhum documento ainda"
            description="Assim que houver notas das suas empresas, elas aparecem aqui. Se você espera ver algo, fale com a equipe."
          />
        </Card>
      ) : (
        <>
          {/* No casco da tabela (07/10/2026), como o acervo da equipe: a
              contagem e o "Filtros" na barra — o botão ficava sozinho acima da
              tabela, e a contagem só aparecia no pé —, e a paginação embaixo. */}
          <CascoDaTabela
            contagem={contarItens(total, "documento", "documentos", totalLimitado)}
            filtros={<PortalCompetenciaFiltro competencias={competencias} empresas={empresas} naBarra />}
          >
            {documentos.length === 0 ? (
              <EmptyState
                icon={<FileText />}
                title={params.competencia ? "Nenhum documento nesta competência" : "Nenhum documento desta empresa"}
                description={params.competencia ? "Escolha outro mês." : "Escolha outra empresa nos filtros."}
              />
            ) : (
              <PortalDocumentosTable documentos={documentos} />
            )}
          </CascoDaTabela>
          {documentos.length > 0 && (
            <PaginacaoDosDocumentos
              total={total}
              totalLimitado={totalLimitado}
              temProxima={temProxima}
              pagina={pagina}
              porPagina={porPagina}
              filtrosDaUrl={params}
            />
          )}
        </>
      )}
    </PageContainer>
  );
}
