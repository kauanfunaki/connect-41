import { notFound } from "next/navigation";
import { Upload, FileText, Truck, Hourglass, CheckCircle2, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { listarDocumentos, competenciasDisponiveis, resumoPorDestino } from "@/lib/fiscal/data";
import { AcervoTable, PaginacaoDoAcervo } from "@/components/fiscal/AcervoTable";
import { BuscaDoAcervo, FiltrosDoAcervo } from "@/components/fiscal/AcervoFiltros";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { alcanceDaEquipe } from "./alcance";
import type { FiscalDocumentType, FiscalDocumentDestination } from "@/generated/prisma/enums";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";
const INTEIRO = new Intl.NumberFormat("pt-BR");

// Acervo de documentos fiscais — o que já foi emitido, espelhado aqui.
//
// O módulo NÃO emite nada: reflete, aceita o que falta (deduplicando) e vira
// lançamento. Emissão está em standby desde 2026-08-21.
export default async function DocumentosFiscaisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  // Gate de módulo além do gate de setor: o módulo é vendido por plano, e quem
  // é do fiscal num tenant que não contratou não deve ver a tela.
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const filtro = {
    companyId: params.empresa || undefined,
    competencia: params.competencia || undefined,
    tipo: (params.tipo as FiscalDocumentType) || undefined,
    destino: (params.destino as FiscalDocumentDestination) || undefined,
    busca: params.q || undefined,
  };
  const pagina = Math.max(1, Number(params.pagina) || 1);

  const alcance = alcanceDaEquipe(ctx.tenantId);
  const prisma = getPrisma();

  const [{ documentos, total, totalLimitado, temProxima, porPagina }, competencias, resumo, empresas] = await Promise.all([
    listarDocumentos(alcance, filtro, pagina),
    competenciasDisponiveis(alcance),
    resumoPorDestino(alcance, { ...filtro, destino: undefined }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true },
    }),
  ]);

  const semNenhum = total === 0 && !params.q && !params.empresa && !params.competencia && !params.tipo && !params.destino;

  // O cartão de destino é atalho para o recorte, mantendo os outros filtros; o
  // do recorte ativo volta para todos (o mesmo gesto de /processos).
  const hrefDoDestino = (destino: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k !== "pagina" && k !== "destino" && typeof v === "string" && v) q.set(k, v);
    }
    if (destino !== params.destino) q.set("destino", destino);
    const s = q.toString();
    return s ? `/documentos-fiscais?${s}` : "/documentos-fiscais";
  };

  return (
    <PageContainer>
      {/* Os dois atalhos eram links pintados à mão para parecer botão; agora são
          o `Button` (conferência de 30/09: botão não é link). */}
      <PageHeader
        title="Documentos fiscais"
        subtitle={
          <>
            NF-e, NFC-e e NFS-e por empresa e competência. O acervo espelha o que já foi
            emitido — nada é emitido aqui. <strong>CT-e não entra no acervo</strong>: são milhões
            por mês e vêm sem valor apurado, então ficam na consulta ao vivo.
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button href="/documentos-fiscais/cte" variant="secondary">
              <Truck size={14} /> Consultar CT-e
            </Button>
            <Button href="/documentos-fiscais/entrada">
              <Upload size={14} /> Entrada de XML
            </Button>
          </div>
        }
      />

      {semNenhum ? (
        <Card>
          <EmptyState
            icon={<FileText />}
            title="Nenhum documento no acervo"
            description="Os documentos chegam pela sincronização com o SPED ou pela entrada de XML. Enquanto a ponte com o SPED não estiver ligada, use a entrada manual."
          />
        </Card>
      ) : (
        <>
          {/* Eram três células coladas numa grade de 1px; viraram os cartões do
              padrão (30/09), e cada um abre o recorte do destino que conta. */}
          <FaixaDeTotais
            itens={(["PENDENTE", "LANCADO", "IGNORADO"] as const).map((d) => ({
              rotulo: d === "PENDENTE" ? "Pendentes de decisão" : d === "LANCADO" ? "Lançados" : "Ignorados",
              valor: `${INTEIRO.format(resumo[d].total)}${resumo[d].limitado ? "+" : ""}`,
              icone: d === "PENDENTE" ? <Hourglass /> : d === "LANCADO" ? <CheckCircle2 /> : <EyeOff />,
              tom: d === "LANCADO" ? "text-success" : d === "IGNORADO" ? "text-fg-muted" : undefined,
              detalhe: params.destino === d ? "mostrando agora" : undefined,
              ativo: params.destino === d,
              href: hrefDoDestino(d),
            }))}
          />

          {/* Contagem, busca e filtros na barra do casco (07/10/2026), como as
              filas irmãs de 05/10 — eram uma fileira acima da tabela, a
              contagem só aparecia no rodapé e o vazio era um cartão à parte. */}
          <CascoDaTabela
            contagem={contarItens(total, "documento", "documentos", totalLimitado)}
            busca={<BuscaDoAcervo />}
            filtros={<FiltrosDoAcervo empresas={empresas} competencias={competencias} />}
          >
            {documentos.length === 0 ? (
              <EmptyState
                icon={<FileText />}
                title="Nenhum documento com estes filtros"
                description="Limpe os filtros ou mude a competência."
              />
            ) : (
              <AcervoTable documentos={documentos} />
            )}
          </CascoDaTabela>

          <PaginacaoDoAcervo
            total={total}
            totalLimitado={totalLimitado}
            temProxima={temProxima}
            pagina={pagina}
            porPagina={porPagina}
            filtrosDaUrl={params}
          />
        </>
      )}
    </PageContainer>
  );
}
