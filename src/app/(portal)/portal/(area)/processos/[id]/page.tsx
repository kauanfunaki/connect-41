import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, CircleDot, Circle, MessageSquare } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { processoDoPortal } from "@/lib/societario/portal-data";
import { SITUACAO_PARA_CLIENTE, STATUS_DA_ETAPA_PARA_CLIENTE, VARIANTE_PARA_CLIENTE } from "@/lib/societario/portal";
import { moeda } from "@/lib/financeiro/formato";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ICONE_DA_ETAPA = {
  CONCLUIDA: <CircleCheck size={16} className="text-success shrink-0" aria-hidden />,
  EM_ANDAMENTO: <CircleDot size={16} className="text-info shrink-0" aria-hidden />,
  PENDENTE: <Circle size={16} className="text-fg-muted shrink-0" aria-hidden />,
} as const;

/**
 * Um processo visto pelo cliente: em que pé está, as etapas, o que o órgão
 * pediu e as taxas. Observações, responsável, prioridade e checklist ficam só
 * com a equipe (ver `src/lib/societario/portal.ts`).
 */
export default async function PortalProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const { sessao, escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("societario_processos")) notFound();

  const { id } = await params;
  const feriados = await feriadosDoTenant(sessao.tenantId);
  const p = await processoDoPortal(sessao.tenantId, escopo.companyIds ?? [], id, new Date(), feriados);
  if (!p) notFound();

  const situacao = SITUACAO_PARA_CLIENTE[p.situacao];
  const abertas = p.exigencias.filter((e) => !e.resolvidaEm);
  const resolvidas = p.exigencias.filter((e) => e.resolvidaEm);

  return (
    <PageContainer>
      <Link href="/portal/processos" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg mb-3">
        <ArrowLeft size={14} /> Processos
      </Link>
      <PageHeader
        title={p.titulo || p.tipoNome}
        subtitle={
          <>
            {p.titulo ? `${p.tipoNome} · ` : ""}
            {p.empresaNome} · aberto em {formatInstantDate(p.iniciadoEm)}
            {p.concluidoEm ? ` · concluído em ${formatInstantDate(p.concluidoEm)}` : ""}
          </>
        }
      />

      <div className="flex flex-col gap-5 mt-4">
        <Card className="p-4 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={VARIANTE_PARA_CLIENTE[p.situacao]}>{situacao.rotulo}</Badge>
            {p.progresso.total > 0 && (
              <span className="text-[13px] text-fg-muted tabular-nums">
                {p.progresso.feitas} de {p.progresso.total} etapas concluídas
              </span>
            )}
          </div>
          <p className="text-[13px] text-fg">{situacao.explicacao}</p>
          <p className="text-[12px] text-fg-muted">{p.previsao}</p>
        </Card>

        {abertas.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="exigencias-abertas">
            <h2 id="exigencias-abertas" className="text-[14px] font-semibold text-fg">
              O que o órgão pediu
            </h2>
            {abertas.map((e) => (
              <Card key={e.id} className="p-4 flex flex-col gap-1 border-warning/40">
                <span className="text-[12px] font-semibold text-warning">{e.orgao}</span>
                <p className="text-[13px] text-fg whitespace-pre-line break-words">{e.descricao}</p>
                <span className="text-[12px] text-fg-muted">
                  Pedida em {formatInstantDate(e.abertaEm)}
                  {e.prazo ? ` · prazo do órgão ${formatInstantDate(e.prazo)}` : ""}
                </span>
              </Card>
            ))}
          </section>
        )}

        {p.etapas.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="etapas">
            <h2 id="etapas" className="text-[14px] font-semibold text-fg">
              Etapas
            </h2>
            <Card className="p-2">
              <ol className="flex flex-col">
                {p.etapas.map((e) => {
                  const status = e.status as keyof typeof STATUS_DA_ETAPA_PARA_CLIENTE;
                  return (
                    <li key={e.posicao} className="flex items-center gap-2.5 px-2 py-2 border-b border-border-soft last:border-0">
                      {ICONE_DA_ETAPA[status]}
                      <span className="flex-1 min-w-0 text-[13px] text-fg break-words">
                        {e.rotulo}
                        {e.orgao ? <span className="text-fg-muted"> · {e.orgao}</span> : null}
                      </span>
                      <span className="text-[12px] text-fg-muted whitespace-nowrap">{STATUS_DA_ETAPA_PARA_CLIENTE[status]}</span>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </section>
        )}

        {p.taxas.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="taxas">
            <h2 id="taxas" className="text-[14px] font-semibold text-fg">
              Taxas
            </h2>
            <Card className="p-2">
              <ul className="flex flex-col">
                {p.taxas.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-2 border-b border-border-soft last:border-0">
                    <span className="flex-1 min-w-[12rem] text-[13px] text-fg break-words">{t.descricao}</span>
                    <span className="text-[13px] font-medium tabular-nums">{moeda(t.centavos)}</span>
                    <span className="text-[12px] text-fg-muted whitespace-nowrap">
                      {t.pagaEm
                        ? `paga em ${formatInstantDate(t.pagaEm)}`
                        : t.vencimento
                          ? `vence em ${formatInstantDate(t.vencimento)}`
                          : "a pagar"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        {resolvidas.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="exigencias-resolvidas">
            <h2 id="exigencias-resolvidas" className="text-[14px] font-semibold text-fg">
              Exigências resolvidas
            </h2>
            <Card className="p-2">
              <ul className="flex flex-col">
                {resolvidas.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 px-2 py-2 border-b border-border-soft last:border-0">
                    <span className="text-[13px] text-fg break-words">
                      <span className="font-medium">{e.orgao}:</span> {e.descricao}
                    </span>
                    <span className="text-[12px] text-fg-muted">resolvida em {formatInstantDate(e.resolvidaEm!)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        {modulos.has("bpo_comunicacao") && (
          <Link href="/portal/comunicacao" className="inline-flex items-center gap-1.5 text-[13px] text-brand hover:underline self-start">
            <MessageSquare size={14} /> Falar com a equipe sobre este processo
          </Link>
        )}
      </div>
    </PageContainer>
  );
}
