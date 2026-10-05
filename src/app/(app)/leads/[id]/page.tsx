import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { canActOnSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatCnpj, formatInstantDateTime, formatPhone } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AcompanhamentoDoLead } from "@/components/leads/AcompanhamentoDoLead";
import { MODULO_LEADS, ROTULO_DO_STATUS, VARIANTE_DO_STATUS, rotuloDaOrigem } from "@/lib/leads/regras";

export const dynamic = "force-dynamic";

const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

function Dado({ rotulo, children, className = "" }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{rotulo}</dt>
      <dd className="mt-0.5 text-fg break-words">{children}</dd>
    </div>
  );
}

/**
 * Um lead visto pela equipe (05/10/2026): o que a pessoa mandou, como falar com
 * ela e o acompanhamento — situação, responsável e observações. Converter em
 * empresa não entra agora (decisão do Kauan).
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
  const doSetor = podeAgir ? await getSectorUsers(ctx.tenantId, setor) : [];
  // Quem já é o responsável continua na lista mesmo se saiu do setor — senão o
  // seletor mostraria "Sem responsável" e salvar tiraria a pessoa sem querer.
  const responsaveis =
    lead.assignee && !doSetor.some((p) => p.id === lead.assignee!.id) ? [lead.assignee, ...doSetor] : doSetor;

  // Link do WhatsApp com o 55 do Brasil: o telefone é guardado só com DDD + número.
  const whatsapp = lead.phone ? `https://wa.me/55${lead.phone}` : null;

  return (
    <PageContainer>
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg mb-3">
        <ArrowLeft size={14} /> Leads
      </Link>
      <PageHeader
        title={lead.name}
        subtitle={`${lead.companyName ?? "Empresa não informada"} · ${rotuloDaOrigem(lead.source)} · recebido em ${formatInstantDateTime(lead.createdAt, QUANDO)}`}
        action={<Badge variant={VARIANTE_DO_STATUS[lead.status]}>{ROTULO_DO_STATUS[lead.status]}</Badge>}
      />

      <Card className="mb-5 p-4">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 text-[13px]">
          <Dado rotulo="E-mail">
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="text-brand hover:underline break-all">
                {lead.email}
              </a>
            ) : (
              "—"
            )}
          </Dado>
          <Dado rotulo="Telefone ou WhatsApp">
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
          </Dado>
          <Dado rotulo="Empresa">
            {lead.companyName ?? "—"}
            {lead.cnpj && <span className="block text-[12px] text-fg-muted tabular-nums">CNPJ {formatCnpj(lead.cnpj)}</span>}
          </Dado>
          <Dado rotulo="O que procura" className="sm:col-span-3">
            {lead.message ? <span className="whitespace-pre-wrap">{lead.message}</span> : <span className="text-fg-muted">Não escreveu nada.</span>}
          </Dado>
          <Dado rotulo="Origem">{rotuloDaOrigem(lead.source)}</Dado>
          <Dado rotulo="Recebido em">
            <span className="tabular-nums">{formatInstantDateTime(lead.createdAt, QUANDO)}</span>
          </Dado>
          <Dado rotulo="Aceite da política de privacidade">
            {lead.privacyAcceptedAt ? (
              <span className="tabular-nums">{formatInstantDateTime(lead.privacyAcceptedAt, QUANDO)}</span>
            ) : (
              <span className="text-fg-muted">Não registrado nesta entrada</span>
            )}
          </Dado>
        </dl>
      </Card>

      <Card className="p-4">
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
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 text-[13px]">
            <Dado rotulo="Situação">{ROTULO_DO_STATUS[lead.status]}</Dado>
            <Dado rotulo="Responsável">{lead.assignee?.name ?? "Sem responsável"}</Dado>
            <Dado rotulo="Observações" className="sm:col-span-3">
              {lead.notes ? <span className="whitespace-pre-wrap">{lead.notes}</span> : <span className="text-fg-muted">Nenhuma.</span>}
            </Dado>
          </dl>
        )}
      </Card>
    </PageContainer>
  );
}
