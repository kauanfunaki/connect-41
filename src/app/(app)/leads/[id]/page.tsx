import { notFound } from "next/navigation";
import { BackButton } from "@/components/shared/BackButton";
import { getPrisma } from "@/lib/prisma";
import { canActOnSector, canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatCnpj, formatInstantDateTime, formatPhone } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { InfoRow } from "@/components/empresas/InfoRow";
import { AcompanhamentoDoLead } from "@/components/leads/AcompanhamentoDoLead";
import { ExcluirLead } from "@/components/leads/ExcluirLead";
import { MODULO_LEADS, ROTULO_DO_STATUS, TOM_DO_STATUS, rotuloDaOrigem } from "@/lib/leads/regras";

export const dynamic = "force-dynamic";

const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

/**
 * Um lead visto pela equipe (05/10/2026): o que a pessoa mandou, como falar com
 * ela e o acompanhamento — situação, responsável e observações. Converter em
 * empresa não entra agora (decisão do Kauan).
 *
 * Auditoria de 07/10/2026: o par rótulo/valor era um `Dado` local (rótulo de
 * 11px em caixa alta) e virou o `InfoRow` das fichas (DRG-11); a situação foi
 * do lado do "Excluir" para o `meta` do cabeçalho, em `Selo` (DRG-05/23); os
 * cartões passaram a p-5, como os de conteúdo do resto do app (DRG-09).
 */
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, setor } = await abrirTelaDoModulo(MODULO_LEADS);
  const { id } = await params;

  const lead = await getPrisma().lead.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      companyName: true,
      cnpj: true,
      message: true,
      source: true,
      status: true,
      notes: true,
      privacyAcceptedAt: true,
      createdAt: true,
      updatedAt: true,
      assignee: { select: { id: true, name: true } },
    },
  });
  if (!lead) notFound();

  const podeAgir = canActOnSector(ctx, setor);
  const podeExcluir = canManageSector(ctx, setor);
  const doSetor = podeAgir ? await getSectorUsers(ctx.tenantId, setor) : [];
  // Quem já é o responsável continua na lista mesmo se saiu do setor — senão o
  // seletor mostraria "Sem responsável" e salvar tiraria a pessoa sem querer.
  const responsaveis =
    lead.assignee && !doSetor.some((p) => p.id === lead.assignee!.id) ? [lead.assignee, ...doSetor] : doSetor;

  // Link do WhatsApp com o 55 do Brasil: o telefone é guardado só com DDD + número.
  const whatsapp = lead.phone ? `https://wa.me/55${lead.phone}` : null;

  return (
    <PageContainer>
      <BackButton href="/leads" rotulo="Leads" className="mb-3" />
      <PageHeader
        title={lead.name}
        subtitle={`${lead.companyName ?? "Empresa não informada"} · ${rotuloDaOrigem(lead.source)} · recebido em ${formatInstantDateTime(lead.createdAt, QUANDO)}`}
        meta={<Selo tom={TOM_DO_STATUS[lead.status]}>{ROTULO_DO_STATUS[lead.status]}</Selo>}
        action={podeExcluir ? <ExcluirLead id={lead.id} /> : undefined}
      />

      <Card className="mb-5 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
          <InfoRow label="E-mail">
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="text-brand hover:underline break-all">
                {lead.email}
              </a>
            ) : (
              "—"
            )}
          </InfoRow>
          <InfoRow label="Telefone ou WhatsApp">
            {lead.phone ? (
              <span className="tabular-nums">
                {formatPhone(lead.phone)}
                {whatsapp && (
                  <>
                    {" · "}
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                      abrir no WhatsApp
                    </a>
                  </>
                )}
              </span>
            ) : (
              "—"
            )}
          </InfoRow>
          <InfoRow label="Empresa">
            {lead.companyName ?? "—"}
            {lead.cnpj && <span className="block text-[length:var(--fs-2)] text-fg-muted tabular-nums">CNPJ {formatCnpj(lead.cnpj)}</span>}
          </InfoRow>
          <InfoRow label="O que procura" className="sm:col-span-3">
            {lead.message ? <span className="whitespace-pre-wrap">{lead.message}</span> : <span className="text-fg-muted">Não escreveu nada.</span>}
          </InfoRow>
          <InfoRow label="Origem" value={rotuloDaOrigem(lead.source)} />
          <InfoRow label="Recebido em" value={formatInstantDateTime(lead.createdAt, QUANDO)} mono />
          <InfoRow label="Aceite da política de privacidade">
            {lead.privacyAcceptedAt ? (
              <span className="tabular-nums">{formatInstantDateTime(lead.privacyAcceptedAt, QUANDO)}</span>
            ) : (
              <span className="text-fg-muted">Não registrado nesta entrada</span>
            )}
          </InfoRow>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[length:var(--fs-6)] font-semibold text-fg mb-3">Acompanhamento</h2>
        {podeAgir ? (
          <AcompanhamentoDoLead
            id={lead.id}
            versao={lead.updatedAt.toISOString()}
            status={lead.status}
            responsavelId={lead.assignee?.id ?? null}
            observacoes={lead.notes}
            responsaveis={responsaveis}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
            <InfoRow label="Situação" value={ROTULO_DO_STATUS[lead.status]} />
            <InfoRow label="Responsável" value={lead.assignee?.name ?? "Sem responsável"} />
            <InfoRow label="Observações" className="sm:col-span-3">
              {lead.notes ? <span className="whitespace-pre-wrap">{lead.notes}</span> : <span className="text-fg-muted">Nenhuma.</span>}
            </InfoRow>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
