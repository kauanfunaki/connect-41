import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoRow } from "@/components/empresas/InfoRow";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { obterDocumento } from "@/lib/fiscal/data";
import { alcanceDaEquipe } from "../alcance";
import { definirDestino } from "./actions";
import { DestinoControl } from "@/components/fiscal/DestinoControl";
import { LancamentoCard } from "@/components/fiscal/LancamentoCard";
import { lancarDocumento, estornarLancamento } from "./lancar";
import { podeLancar, vencimentoPresumido } from "@/lib/financeiro/lancamento";
import { getPrisma } from "@/lib/prisma";
import { direcaoDoLancamento, precisaDeEstorno } from "@/lib/fiscal/documentos";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { nomeExibicao } from "@/lib/companyName";
import { formatCalendarDate, formatInstantDate, formatCnpj, formatCpf } from "@/lib/format";
import {
  TIPO_LABEL,
  ORIGEM_LABEL,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
  DESTINO_LABEL,
  DESTINO_VARIANTE,
  DIRECAO_LABEL,
  competenciaLegivel,
} from "@/lib/fiscal/rotulos";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** CNPJ tem 14 dígitos, CPF tem 11 — o próprio dado diz como se formata. */
function documentoLegivel(valor: string | null): string {
  if (!valor) return "—";
  return valor.length === 11 ? formatCpf(valor) : formatCnpj(valor);
}

export default async function DocumentoFiscalPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const { id } = await params;
  const doc = await obterDocumento(alcanceDaEquipe(ctx.tenantId), id);
  // `notFound` cobre "não existe" e "fora do alcance" com a mesma resposta: a
  // diferença entre as duas já é informação sobre o que existe no tenant.
  if (!doc) notFound();

  const empresaDoc = documentoDaEmpresa(doc.company);
  const direcao = direcaoDoLancamento(empresaDoc?.digitos ?? null, {
    emitenteDocumento: doc.issuerDocument,
    destinatarioDocumento: doc.recipientDocument,
  });
  const estorno = precisaDeEstorno({ situacao: doc.situation, destino: doc.destination });

  // O veredito é calculado aqui, no servidor, e não no componente: a mesma
  // função que a action usa para recusar é a que a tela usa para explicar. Duas
  // cópias da regra é como a tela oferece um botão que a action nega.
  const veredito = podeLancar({
    situacao: doc.situation,
    destino: doc.destination,
    removidoNaOrigem: doc.removedAtOrigin,
    jaTemLancamento: doc.financeEntry !== null,
    valor: doc.amount === null ? null : String(doc.amount),
    direcao,
  });

  const categorias =
    veredito.pode && !doc.financeEntry
      ? await getPrisma().financeCategory.findMany({
          where: { tenantId: ctx.tenantId, active: true, kind: direcao === "RECEBER" ? "RECEBER" : "PAGAR" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];

  return (
    <PageContainer variant="narrow">
      <BackButton className="mb-3" />

      <div className="flex items-start justify-between gap-4 mb-1">
        <PageHeader title={`${TIPO_LABEL[doc.type]} nº ${doc.number}${doc.series ? `/${doc.series}` : ""}`} />
        <div className="flex items-center gap-1.5 flex-shrink-0 pt-1">
          <Badge variant={SITUACAO_VARIANTE[doc.situation]}>{SITUACAO_LABEL[doc.situation]}</Badge>
          <Badge variant={DESTINO_VARIANTE[doc.destination]}>{DESTINO_LABEL[doc.destination]}</Badge>
        </div>
      </div>
      <p className="text-[length:var(--fs-helper)] text-fg-muted mb-6">
        {nomeExibicao(doc.company)} · {competenciaLegivel(doc.competence)}
      </p>

      {doc.removedAtOrigin && (
        <Card className="p-4 mb-4 border-danger/40 bg-danger-bg">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[length:var(--fs-ui)] font-semibold text-danger">Removido na origem</p>
              <p className="text-[length:var(--fs-helper)] text-fg-secondary mt-0.5">
                O índice do SPED deixou de ter este documento — em geral porque o Portal Nacional
                passou a mostrá-lo como cancelado ou substituído. Ele saiu da listagem, mas a linha
                fica aqui: se já tiver virado lançamento, alguém precisa decidir o estorno.
                {doc.removedAtOriginAt ? ` Detectado em ${formatInstantDate(doc.removedAtOriginAt)}.` : ""}
              </p>
            </div>
          </div>
        </Card>
      )}

      {estorno && (
        <Card className="p-4 mb-4 border-danger/40 bg-danger-bg">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[length:var(--fs-ui)] font-semibold text-danger">
                Cancelada depois de lançada
              </p>
              <p className="text-[length:var(--fs-helper)] text-fg-secondary mt-0.5">
                O emissor cancelou este documento e ele já tinha virado lançamento. O dinheiro está
                lançado contra uma nota que não existe mais — o estorno é manual, no financeiro.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 mb-4">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-4">Documento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Tipo" value={TIPO_LABEL[doc.type]} />
          <InfoRow label="Emissão" value={formatCalendarDate(doc.issuedAt, { day: "2-digit", month: "long", year: "numeric" })} />
          <InfoRow
            label="Valor total"
            value={doc.amount === null ? "Não veio do índice" : MOEDA.format(Number(doc.amount))}
          />
          <InfoRow label="Competência" value={competenciaLegivel(doc.competence)} />
          <InfoRow label="Chave de acesso" value={doc.accessKey} mono />
          <InfoRow
            label="Origem"
            value={
              doc.origin === "SPED" && doc.completude === "PARCIAL"
                ? `${ORIGEM_LABEL[doc.origin]} · linha parcial`
                : ORIGEM_LABEL[doc.origin]
            }
          />
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-1">Partes</h2>
        {/* A direção é calculada, não guardada: é função do documento da empresa
            contra as duas pontas, e gravá-la criaria um campo que passa a mentir
            se o CNPJ do cadastro for corrigido. */}
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
          Direção: <span className="font-medium text-fg">{DIRECAO_LABEL[direcao]}</span>
          {direcao === "INDEFINIDA" && " — a empresa está nas duas pontas, ou em nenhuma"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Emitente" value={doc.issuerName} />
          <InfoRow label="CNPJ/CPF do emitente" value={documentoLegivel(doc.issuerDocument)} mono />
          <InfoRow label="Destinatário" value={doc.recipientName} />
          <InfoRow label="CNPJ/CPF do destinatário" value={documentoLegivel(doc.recipientDocument)} mono />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-1">Destino</h2>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
          O que o BPO faz com este documento. É o único dos três eixos que é decisão nossa — origem e
          situação vêm de fora.
        </p>
        <DestinoControl
          documentoId={doc.id}
          destinoAtual={doc.destination}
          motivoAtual={doc.ignoredReason}
          podeDecidir={canManageSector(ctx, SECTOR)}
          action={definirDestino}
        />
      </Card>

      <LancamentoCard
        documentoId={doc.id}
        direcao={direcao === "RECEBER" ? "RECEBER" : "PAGAR"}
        podeDecidir={canManageSector(ctx, SECTOR)}
        categorias={categorias}
        vencimentoPresumidoIso={vencimentoPresumido(doc.issuedAt).toISOString().slice(0, 10)}
        impedimento={veredito.pode || doc.financeEntry ? null : veredito.explicacao}
        lancamento={
          doc.financeEntry
            ? {
                id: doc.financeEntry.id,
                kind: doc.financeEntry.kind,
                status: doc.financeEntry.status,
                dueDateLabel: formatCalendarDate(doc.financeEntry.dueDate),
                amountLabel: MOEDA.format(Number(doc.financeEntry.amount)),
                categoria: doc.financeEntry.category?.name ?? null,
                contraparte: doc.financeEntry.counterparty.name,
              }
            : null
        }
        lancarAction={lancarDocumento}
        estornarAction={estornarLancamento}
      />

      <Card className="p-5 mt-4">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-2">Registro</h2>
        {doc.uploadedBy && (
          <p className="text-[length:var(--fs-micro)] text-fg-muted mt-4">
            Subido por {doc.uploadedBy.name} em {formatInstantDate(doc.createdAt)}.
          </p>
        )}
      </Card>
    </PageContainer>
  );
}
