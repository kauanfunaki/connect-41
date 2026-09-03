import { notFound } from "next/navigation";
import Link from "next/link";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileText } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { listarDocumentos, competenciasDisponiveis, resumoPorDestino } from "@/lib/fiscal/data";
import { AcervoTable } from "@/components/fiscal/AcervoTable";
import { AcervoFiltros } from "@/components/fiscal/AcervoFiltros";
import { alcanceDaEquipe } from "./alcance";
import type { FiscalDocumentType, FiscalDocumentDestination } from "@/generated/prisma/enums";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

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
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
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

  const [{ documentos, total, porPagina }, competencias, resumo, empresas] = await Promise.all([
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

  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <PageHeader title="Documentos Fiscais" />
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
            NF-e, NFC-e, CT-e e NFS-e por empresa e competência. O acervo espelha o que já foi
            emitido — nada é emitido aqui.
          </p>
        </div>
        <Link
          href="/documentos-fiscais/entrada"
          className="inline-flex items-center gap-2 flex-shrink-0 rounded-md bg-brand px-3 py-2 text-[length:var(--fs-button)] font-medium text-white hover:bg-brand-hover transition-colors"
        >
          <Upload size={16} /> Entrada de XML
        </Link>
      </div>

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
          <div className="grid grid-cols-3 gap-px bg-border border border-border rounded-lg overflow-hidden mb-4">
            {(["PENDENTE", "LANCADO", "IGNORADO"] as const).map((d) => (
              <div key={d} className="bg-surface px-4 py-3">
                <p className="text-[20px] font-semibold text-fg tabular-nums leading-none">{resumo[d]}</p>
                <p className="text-[11px] text-fg-muted mt-1.5">
                  {d === "PENDENTE" ? "Pendentes de decisão" : d === "LANCADO" ? "Lançados" : "Ignorados"}
                </p>
              </div>
            ))}
          </div>

          <AcervoFiltros empresas={empresas} competencias={competencias} />

          {documentos.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon={<FileText />}
                title="Nenhum documento com estes filtros"
                description="Limpe os filtros ou mude a competência."
              />
            </Card>
          ) : (
            <AcervoTable documentos={documentos} total={total} pagina={pagina} porPagina={porPagina} filtrosDaUrl={params} />
          )}
        </>
      )}
    </PageContainer>
  );
}
