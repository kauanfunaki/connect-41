import { notFound } from "next/navigation";
import { CircleCheck, CircleDot, Circle } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { SeloDoProcesso } from "@/components/portal/SeloDoProcesso";
import { Aviso } from "@/components/ui/Aviso";
import { TituloDeSecao } from "@/components/portal/TituloDeSecao";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { processoDoPortal } from "@/lib/societario/portal-data";
import { SITUACAO_PARA_CLIENTE, STATUS_DA_ETAPA_PARA_CLIENTE } from "@/lib/societario/portal";
import { moeda } from "@/lib/financeiro/formato";
import { formatInstantDate } from "@/lib/format";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { DocumentosDoProcesso } from "@/components/societario/DocumentosDoProcesso";
import { conversaDoProcesso } from "@/lib/societario/conversa";
import { enviarMensagemNoProcessoCliente, adicionarDocumentosNoProcessoCliente } from "../actions";

export const dynamic = "force-dynamic";

const ICONE_DA_ETAPA = {
  CONCLUIDA: <CircleCheck size={16} className="text-success-fg shrink-0" aria-hidden />,
  EM_ANDAMENTO: <CircleDot size={16} className="text-info shrink-0" aria-hidden />,
  PENDENTE: <Circle size={16} className="text-fg-muted shrink-0" aria-hidden />,
} as const;

/**
 * Um processo visto pelo cliente: em que pé está, as etapas, o que o órgão
 * pediu, as taxas, a conversa com a equipe e os documentos. Observações,
 * responsável, prioridade e checklist ficam só com a equipe (ver
 * `src/lib/societario/portal.ts`).
 */
export default async function PortalProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const { sessao, escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("societario_processos")) notFound();

  const { id } = await params;
  const feriados = await feriadosDoTenant(sessao.tenantId);
  const p = await processoDoPortal(sessao.tenantId, escopo.companyIds ?? [], id, new Date(), feriados);
  if (!p) notFound();
  const conversa = await conversaDoProcesso({ tenantId: sessao.tenantId, companyIds: escopo.companyIds ?? [] }, p.id);

  const situacao = SITUACAO_PARA_CLIENTE[p.situacao];
  const abertas = p.exigencias.filter((e) => !e.resolvidaEm);
  const resolvidas = p.exigencias.filter((e) => e.resolvidaEm);

  return (
    <PageContainer>
      {/* O "voltar" com destino fixo, no BackButton (07/10/2026): quem chega pelo
          link do e-mail não tem histórico para onde voltar, e o link escrito
          à mão tinha 20px de alvo. */}
      <BackButton href="/portal/processos" rotulo="Processos" className="mb-3" />
      {/* A situação e as etapas no `meta`, embaixo do título, como no detalhe
          da equipe (07/10/2026) — moravam num cartão abaixo do cabeçalho, um
          terceiro lugar para o selo entre os detalhes do portal. */}
      <PageHeader
        title={p.titulo || p.tipoNome}
        subtitle={
          <>
            {p.titulo ? `${p.tipoNome} · ` : ""}
            {p.empresaNome} · aberto em {formatInstantDate(p.iniciadoEm)}
            {p.concluidoEm ? ` · concluído em ${formatInstantDate(p.concluidoEm)}` : ""}
          </>
        }
        meta={
          <>
            <SeloDoProcesso situacao={p.situacao} />
            {p.progresso.total > 0 && (
              <span className="tabular-nums">
                {p.progresso.feitas} de {p.progresso.total} etapas concluídas
              </span>
            )}
          </>
        }
      />

      {/* Sem `mt-4`: o PageHeader já deixa 28px, e os dois somados abriam um
          vão maior que o de qualquer outra tela do portal. */}
      <div className="flex flex-col gap-5">
        <Card className="p-4 flex flex-col gap-1.5">
          <p className="text-ui text-fg">{situacao.explicacao}</p>
          {p.motivo && (
            <Aviso tom="neutro" className="break-words">
              <span className="font-medium text-fg">Motivo:</span> {p.motivo}
            </Aviso>
          )}
          <p className="text-fs-2 text-fg-muted">{p.previsao}</p>
        </Card>

        {/* Títulos de seção no desenho do Início (`TituloDeSecao`, 08/10/2026):
            eram 14px, o tamanho de título de cartão. */}
        {abertas.length > 0 && (
          <section aria-labelledby="exigencias-abertas">
            <TituloDeSecao id="exigencias-abertas">O que o órgão pediu</TituloDeSecao>
            <div className="flex flex-col gap-2">
              {abertas.map((e) => (
                <Card key={e.id} className="p-4 flex flex-col gap-1 border-warning/40">
                  <span className="text-fs-2 font-semibold text-warning-fg">{e.orgao}</span>
                  <p className="text-ui text-fg whitespace-pre-line break-words">{e.descricao}</p>
                  <span className="text-fs-2 text-fg-muted">
                    Pedida em {formatInstantDate(e.abertaEm)}
                    {e.prazo ? ` · prazo do órgão ${formatInstantDate(e.prazo)}` : ""}
                  </span>
                </Card>
              ))}
            </div>
          </section>
        )}

        {p.etapas.length > 0 && (
          <section aria-labelledby="etapas">
            <TituloDeSecao id="etapas">Etapas</TituloDeSecao>
            <Card className="p-2">
              <ol className="flex flex-col">
                {p.etapas.map((e) => {
                  const status = e.status as keyof typeof STATUS_DA_ETAPA_PARA_CLIENTE;
                  return (
                    <li key={e.posicao} className="flex items-center gap-2.5 px-2 py-2 border-b border-border-soft last:border-0">
                      {ICONE_DA_ETAPA[status]}
                      <span className="flex-1 min-w-0 text-ui text-fg break-words">
                        {e.rotulo}
                        {e.orgao ? <span className="text-fg-muted"> · {e.orgao}</span> : null}
                      </span>
                      <span className="text-fs-2 text-fg-muted whitespace-nowrap">{STATUS_DA_ETAPA_PARA_CLIENTE[status]}</span>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </section>
        )}

        {p.taxas.length > 0 && (
          <section aria-labelledby="taxas">
            <TituloDeSecao id="taxas">Taxas</TituloDeSecao>
            <Card className="p-2">
              <ul className="flex flex-col">
                {/* Grade de colunas fixas: o valor ficava logo depois da
                    descrição, e cada linha o punha num ponto conforme o
                    tamanho do "paga em…/a pagar" ao lado. Agora valor e
                    situação são colunas; no celular a situação desce. */}
                {p.taxas.map((t) => (
                  <li
                    key={t.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_8.5rem] items-center gap-x-3 gap-y-0.5 px-2 py-2 border-b border-border-soft last:border-0"
                  >
                    <span className="text-ui text-fg break-words">{t.descricao}</span>
                    <span className="text-ui font-medium tabular-nums text-right whitespace-nowrap">{moeda(t.centavos)}</span>
                    <span className="text-fs-2 text-fg-muted whitespace-nowrap">
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
          <section aria-labelledby="exigencias-resolvidas">
            <TituloDeSecao id="exigencias-resolvidas">Exigências resolvidas</TituloDeSecao>
            <Card className="p-2">
              <ul className="flex flex-col">
                {resolvidas.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 px-2 py-2 border-b border-border-soft last:border-0">
                    <span className="text-ui text-fg break-words">
                      <span className="font-medium">{e.orgao}:</span> {e.descricao}
                    </span>
                    <span className="text-fs-2 text-fg-muted">resolvida em {formatInstantDate(e.resolvidaEm!)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        {conversa && (
          <>
            <section aria-labelledby="documentos">
              <TituloDeSecao id="documentos">Documentos</TituloDeSecao>
              <Card className="p-4">
                <DocumentosDoProcesso
                  processId={p.id}
                  documentos={conversa.documentos}
                  baseDoDownload="/portal/processos/documentos"
                  acao={adicionarDocumentosNoProcessoCliente}
                  ladoDeQuemVe="CLIENTE"
                  dica="A equipe é avisada quando você envia."
                />
              </Card>
            </section>

            <section aria-labelledby="conversa">
              <TituloDeSecao id="conversa">Conversa com a equipe</TituloDeSecao>
              <Card className="p-4 flex flex-col gap-4">
                {conversa.limitada && (
                  <p className="text-fs-2 text-fg-muted">Mostrando só as mensagens mais recentes.</p>
                )}
                {conversa.mensagens.length > 0 ? (
                  <ConversaDaPendencia
                    mensagens={conversa.mensagens}
                    baseDoDownload="/portal/processos/documentos"
                    ladoDeQuemVe="CLIENTE"
                  />
                ) : (
                  <p className="text-ui text-fg-muted">Dúvida sobre este processo? Escreva aqui — fica tudo junto dele.</p>
                )}
                <ResponderPendencia
                  alvo={p.id}
                  campo="processId"
                  acao={enviarMensagemNoProcessoCliente}
                  rotulo="Enviar mensagem"
                  dica="A equipe é avisada quando você escreve."
                />
              </Card>
            </section>
          </>
        )}
      </div>
    </PageContainer>
  );
}
