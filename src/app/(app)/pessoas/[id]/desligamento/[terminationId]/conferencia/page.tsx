import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { listDocuments } from "@/lib/documents";
import { ItemConferenciaRow, type CheckState } from "@/components/rescisao/ItemConferenciaRow";
import { DadosRescisaoForm } from "@/components/rescisao/DadosRescisaoForm";
import {
  RESCISAO_GROUP_ORDER,
  RESCISAO_GROUP_LABEL,
  itemsByGroup,
  resumirConferencia,
  statusPrazoPagamento,
} from "@/lib/rescisaoChecklist";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { salvarItemConferencia, salvarDadosRescisao } from "./actions";

export default async function ConferenciaRescisaoPage({
  params,
}: {
  params: Promise<{ id: string; terminationId: string }>;
}) {
  const { id, terminationId } = await params;
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!person) notFound();

  const termination = await prisma.termination.findFirst({
    where: { id: terminationId, tenantId: ctx.tenantId, personId: id },
    include: {
      checks: { include: { checkedBy: { select: { name: true } } } },
    },
  });
  if (!termination) notFound();

  const documents = await listDocuments(ctx.tenantId, "PERSON", id);

  // Férias em aberto do colaborador — o item "férias vencidas" do checklist
  // exigia conferir no olho contra outro módulo; agora o dado vem junto.
  const feriasEmAberto = await prisma.vacation.findMany({
    where: { tenantId: ctx.tenantId, personId: id, status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
    orderBy: { acquisitivePeriodStart: "asc" },
    select: {
      id: true,
      acquisitivePeriodStart: true,
      acquisitivePeriodEnd: true,
      concessivePeriodEnd: true,
      days: true,
      status: true,
    },
  });
  const hoje = new Date();
  const feriasVencidas = feriasEmAberto.filter(
    (v) => v.concessivePeriodEnd != null && v.concessivePeriodEnd < hoje
  );

  const checkByKey = new Map(
    termination.checks.map((c) => [
      c.itemKey,
      {
        status: c.status,
        informedValue: c.informedValue != null ? c.informedValue.toFixed(2).replace(".", ",") : null,
        note: c.note,
        checkedByName: c.checkedBy?.name ?? null,
        checkedAtLabel: c.checkedAt ? formatInstantDate(c.checkedAt) : null,
      } satisfies CheckState,
    ])
  );

  const resumo = resumirConferencia(termination.checks.map((c) => ({ itemKey: c.itemKey, status: c.status })));
  const prazo = termination.terminationDate ? statusPrazoPagamento(termination.terminationDate, new Date()) : null;

  const divergentes = termination.checks.filter((c) => c.status === "DIVERGENTE");

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Cadastros</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}/desligamento`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Desligamento
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Conferência</span>
      </div>
      <BackButton className="mb-3" />

      <PageHeader
        title="Conferência da rescisão"
        subtitle={
          <>
            {person.name} — o Connect não calcula verbas: registre aqui o que a contabilidade informou e o resultado da
            sua conferência.
          </>
        }
      />

      {/* Prazo legal — contagem de prazo é seguro fazer, cálculo de verba não. */}
      <Card className="p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-3">Dados da rescisão</h2>
        <DadosRescisaoForm
          action={salvarDadosRescisao.bind(null, id, terminationId)}
          defaults={{
            terminationDate: termination.terminationDate
              ? termination.terminationDate.toISOString().slice(0, 10)
              : "",
            noticeType: termination.noticeType ?? "",
          }}
          canEdit={canEdit}
        />

        {prazo ? (
          <div
            className={`mt-4 rounded-md border px-4 py-3 ${
              prazo.status === "VENCIDO"
                ? "bg-danger/8 border-danger/25"
                : prazo.status === "VENCE_HOJE"
                  ? "bg-warning/10 border-warning/25"
                  : "bg-surface-2 border-border"
            }`}
          >
            <p className="text-[13px] text-fg">
              <strong>Prazo legal de pagamento:</strong> {formatCalendarDate(prazo.dueDate)}{" "}
              {prazo.status === "VENCIDO" && (
                <span className="text-danger font-medium">— vencido há {Math.abs(prazo.diasRestantes)} dia(s)</span>
              )}
              {prazo.status === "VENCE_HOJE" && <span className="text-warning font-medium">— vence hoje</span>}
              {prazo.status === "NO_PRAZO" && (
                <span className="text-fg-muted">— faltam {prazo.diasRestantes} dia(s)</span>
              )}
            </p>
            <p className="text-[11px] text-fg-muted mt-1">
              CLT art. 477 §6 — 10 dias corridos contados do término do contrato.
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-fg-muted mt-4">
            Informe a data do término do contrato para o sistema acompanhar o prazo legal de pagamento.
          </p>
        )}
      </Card>

      {/* Resumo */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-[14px] font-semibold text-fg">Resumo da conferência</h2>
          <span className="text-[12px] text-fg-muted tnum">{resumo.progressoPct}% tratado</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-3">
          <div
            className={`h-full rounded-full ${resumo.divergentes > 0 ? "bg-danger" : "bg-brand"}`}
            style={{ width: `${resumo.progressoPct}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-success/10 text-success border border-success/25">
            {resumo.conferidos} conferido{resumo.conferidos !== 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-danger/10 text-danger border border-danger/25">
            {resumo.divergentes} divergente{resumo.divergentes !== 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-surface-2 text-fg-muted border border-border">
            {resumo.pendentes} pendente{resumo.pendentes !== 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-surface-2 text-fg-secondary border border-border">
            {resumo.naoAplicaveis} não se aplica
          </span>
        </div>

        {divergentes.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <h3 className="text-[12px] font-semibold text-danger mb-2">
              Divergências a corrigir com a contabilidade
            </h3>
            <ul className="space-y-1.5">
              {divergentes.map((d) => (
                <li key={d.id} className="text-[12px] text-fg-secondary">
                  <strong className="text-fg">{d.itemKey.replace(/_/g, " ")}</strong>
                  {d.note ? ` — ${d.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Base de conferência das férias — evita abrir outro módulo pra checar
          o que a contabilidade lançou no item "férias vencidas". */}
      {feriasEmAberto.length > 0 && (
        <Card className="p-5 mb-4">
          <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
            <h2 className="text-[14px] font-semibold text-fg">Férias em aberto (base de conferência)</h2>
            <Link href={`/pessoas/${id}/ferias`} className="text-[12px] text-brand hover:underline">
              Abrir módulo de Férias
            </Link>
          </div>
          <p className="text-[12px] text-fg-muted mb-3">
            {feriasVencidas.length > 0
              ? `${feriasVencidas.length} período(s) com prazo de gozo vencido — devem constar como férias vencidas no TRCT.`
              : "Nenhum período vencido; os saldos abaixo entram como proporcionais."}
          </p>
          <div className="divide-y divide-border">
            {feriasEmAberto.map((v) => {
              const vencida = v.concessivePeriodEnd != null && v.concessivePeriodEnd < hoje;
              return (
                <div key={v.id} className="flex items-center justify-between gap-3 py-2 flex-wrap">
                  <span className="text-[13px] text-fg">
                    {formatCalendarDate(v.acquisitivePeriodStart)} → {formatCalendarDate(v.acquisitivePeriodEnd)}
                    <span className="text-fg-muted"> · {v.days} dias</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-fg-muted">
                      {v.concessivePeriodEnd ? `Gozo até ${formatCalendarDate(v.concessivePeriodEnd)}` : "Sem limite definido"}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        vencida ? "bg-danger/10 text-danger border-danger/25" : "bg-surface-2 text-fg-secondary border-border"
                      }`}
                    >
                      {vencida ? "Vencida" : "No prazo"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Checklist agrupado */}
      {RESCISAO_GROUP_ORDER.map((group) => (
        <Card key={group} className="p-5 mb-4">
          <h2 className="text-[14px] font-semibold text-fg mb-1">{RESCISAO_GROUP_LABEL[group]}</h2>
          <div className="divide-y divide-border">
            {itemsByGroup(group).map((item) => (
              <ItemConferenciaRow
                key={item.key}
                item={item}
                current={checkByKey.get(item.key) ?? null}
                action={salvarItemConferencia.bind(null, id, terminationId, item.key)}
                canEdit={canEdit}
              />
            ))}
          </div>
        </Card>
      ))}

      {/* Documentos rescisórios reaproveitam o módulo genérico de anexos. */}
      <DocumentsSection
        entityType="PERSON"
        entityId={id}
        canUpload={canEdit}
        documents={documents.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          category: d.category,
          sensitive: d.sensitive,
          uploadedByName: d.uploadedBy.name,
          createdAtLabel: formatInstantDate(d.createdAt),
          expiresAtLabel: d.expiresAt ? formatCalendarDate(d.expiresAt) : null,
          expired: d.expiresAt != null && d.expiresAt < new Date(),
        }))}
      />
    </PageContainer>
  );
}
