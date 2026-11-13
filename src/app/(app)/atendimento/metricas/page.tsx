import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CalendarRange, CalendarClock } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { contextoDaTela } from "@/lib/atendimento/contexto";
import { ehDaTriagem, veTudo } from "@/lib/atendimento/acesso";
import { nomesDosContatos } from "@/lib/atendimento/dados";
import { PERIODOS, duracaoLegivel, inicioDoPeriodo, metricasDoAtendimento, periodoValido, resumir, type LinhaDoGrupo } from "@/lib/atendimento/metricas";
import { ROTULO_DA_SITUACAO, type Situacao } from "@/lib/atendimento/regras";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { formatInstantDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const ICONES = { 7: <CalendarDays size={16} />, 30: <CalendarRange size={16} />, 90: <CalendarClock size={16} /> } as const;
const HISTORICO = 100;

const UMA_CASA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nota = (n: number | null) => (n === null ? "—" : UMA_CASA.format(n));

/**
 * As métricas e o histórico do Atendimento (12/11/2026): para a triagem (a
 * Controladoria) e para quem foi escolhido para ver todos os atendimentos.
 * Os números são dos atendimentos ABERTOS no período; os tempos são medianas.
 */
export default async function MetricasDoAtendimentoPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const c = await contextoDaTela();
  if (!c || !(ehDaTriagem(c.ctx, c.cfg) || veTudo(c.ctx, c.cfg))) notFound();
  const tenantId = c.ctx.tenantId;
  const dias = periodoValido((await searchParams).dias);
  const desde = inicioDoPeriodo(dias);

  const [{ ciclos, cortado }, maps, agora] = await Promise.all([
    metricasDoAtendimento(tenantId, desde),
    getSectorMaps(tenantId),
    getPrisma().atendimentoCiclo.groupBy({ by: ["situacao"], where: { tenantId, situacao: { not: "ENCERRADO" } }, _count: { _all: true } }),
  ]);
  const r = resumir(ciclos);
  const idsDeGente = new Set<string>();
  for (const x of ciclos) for (const id of [x.assignedToId, x.encerradoPorId]) if (id) idsDeGente.add(id);
  const [gente, nomeDe] = await Promise.all([
    getPrisma().user.findMany({ where: { tenantId, id: { in: [...idsDeGente] } }, select: { id: true, name: true } }),
    nomesDosContatos(tenantId, ciclos.slice(0, HISTORICO).map((x) => x.conversa.contato)),
  ]);
  const pessoa = new Map(gente.map((u) => [u.id, u.name]));
  const setor = (code: string | null) => (code ? sectorLabel(maps.labels, code) : `Só a triagem (${sectorLabel(maps.labels, c.cfg.triagem)})`);
  const agoraEm = (s: Situacao) => agora.find((a) => a.situacao === s)?._count._all ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title="Métricas do Atendimento"
        subtitle="Os atendimentos abertos no período. Os tempos são a mediana: o do meio, que um atendimento esquecido não distorce."
        action={
          <Button href="/atendimento" variant="secondary" size="sm">
            Voltar ao Atendimento
          </Button>
        }
      />

      <AbasDeLink
        aria-label="Período"
        ativa={String(dias)}
        abas={PERIODOS.map((p) => ({ chave: String(p), rotulo: `Últimos ${p} dias`, href: `/atendimento/metricas?dias=${p}`, icone: ICONES[p] }))}
      />

      <section aria-label="Agora" className="mt-5">
        <h2 className="text-card-title font-semibold text-fg mb-2">Agora</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Na triagem" value={agoraEm("TRIAGEM")} tom={agoraEm("TRIAGEM") ? "atencao" : "neutro"} />
          <MetricCard label="Sem responsável no setor" value={agoraEm("NO_SETOR")} tom={agoraEm("NO_SETOR") ? "atencao" : "neutro"} />
          <MetricCard label="Em atendimento" value={agoraEm("EM_ATENDIMENTO")} />
          <MetricCard label="Aguardando o cliente" value={agoraEm("AGUARDANDO_CLIENTE")} />
        </div>
      </section>

      <section aria-label={`Últimos ${dias} dias`} className="mt-6">
        <h2 className="text-card-title font-semibold text-fg mb-2">Últimos {dias} dias</h2>
        {r.total === 0 ? (
          <EmptyState title="Nenhum atendimento no período" description="Quando os clientes escreverem, os números aparecem aqui." />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <MetricCard label="Atendimentos" value={r.total} detalhe={`${r.encerrados} encerrados, ${r.emAberto} em aberto`} />
              <MetricCard label="Primeira resposta" value={duracaoLegivel(r.primeiraResposta)} detalhe={`${r.respondidos} de ${r.total} respondidos`} />
              <MetricCard label="Até encerrar" value={duracaoLegivel(r.ateEncerrar)} detalhe={`${r.encerrados} encerrados`} />
              <MetricCard
                label="Nota do cliente"
                value={r.nota.media === null ? "—" : `${nota(r.nota.media)} de 5`}
                tom={r.nota.media === null ? "neutro" : r.nota.media >= 4 ? "ok" : r.nota.media >= 3 ? "atencao" : "critico"}
                detalhe={`${r.nota.quantas} ${r.nota.quantas === 1 ? "nota" : "notas"} de ${r.nota.pedidas} ${r.nota.pedidas === 1 ? "pedida" : "pedidas"}`}
              />
              <MetricCard
                label="Notas 1 a 5"
                value={r.nota.distribuicao.join(" · ")}
                detalhe="Quantas de cada nota, da 1 à 5"
              />
            </div>
            {cortado && <p className="text-micro text-fg-muted mt-2">O período tem atendimentos demais: os números contam os 5.000 mais recentes.</p>}

            <div className="grid gap-5 xl:grid-cols-2 mt-5">
              <Tabela titulo="Por setor" primeira="Setor" linhas={r.porSetor} nome={setor} />
              <Tabela titulo="Por pessoa" primeira="Quem encerrou (ou está com a conversa)" linhas={r.porPessoa} nome={(id) => (id ? (pessoa.get(id) ?? "Pessoa desativada") : "—")} />
            </div>

            {r.desfechos.length > 0 && (
              <section className="mt-5">
                <h3 className="text-ui font-semibold text-fg mb-2">Desfechos</h3>
                <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                  <table className="w-full min-w-[360px] text-ui">
                    <thead>
                      <tr className="border-b border-border text-left text-micro text-fg-muted">
                        <th className="px-4 py-2.5 font-medium">Desfecho</th>
                        <th className="px-4 py-2.5 font-medium text-right">Atendimentos</th>
                        <th className="px-4 py-2.5 font-medium text-right">Do total encerrado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.desfechos.map((d) => (
                        <tr key={d.texto} className="border-b border-border last:border-b-0">
                          <td className="px-4 py-2.5 text-fg">{d.texto}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{d.n}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-fg-secondary">{Math.round((d.n / Math.max(1, r.encerrados)) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="mt-5">
              <h3 className="text-ui font-semibold text-fg mb-2">Histórico</h3>
              <p className="text-micro text-fg-muted mb-2">
                Os {Math.min(HISTORICO, ciclos.length)} atendimentos mais recentes do período. Clique para abrir a conversa.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                <table className="w-full min-w-[900px] text-ui">
                  <thead>
                    <tr className="border-b border-border text-left text-micro text-fg-muted">
                      <th className="px-4 py-2.5 font-medium">Chegou</th>
                      <th className="px-4 py-2.5 font-medium">Cliente</th>
                      <th className="px-4 py-2.5 font-medium">Setor</th>
                      <th className="px-4 py-2.5 font-medium">Quem atendeu</th>
                      <th className="px-4 py-2.5 font-medium">Situação</th>
                      <th className="px-4 py-2.5 font-medium text-right">1ª resposta</th>
                      <th className="px-4 py-2.5 font-medium text-right">Duração</th>
                      <th className="px-4 py-2.5 font-medium text-right">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ciclos.slice(0, HISTORICO).map((x) => {
                      const n = nomeDe(x.conversa.contato);
                      const quem = x.encerradoPorId ?? x.assignedToId;
                      const primeira = x.primeiraResposta ? (x.primeiraResposta.getTime() - x.abertoEm.getTime()) / 60_000 : null;
                      const duracao = x.encerradoEm ? (x.encerradoEm.getTime() - x.abertoEm.getTime()) / 60_000 : null;
                      return (
                        <tr key={x.id} className="border-b border-border last:border-b-0 hover:bg-surface-sunken">
                          <td className="px-4 py-2.5 tabular-nums text-fg-secondary whitespace-nowrap">{formatInstantDateTime(x.abertoEm, { dateStyle: "short", timeStyle: "short" })}</td>
                          <td className="px-4 py-2.5">
                            <Link href={`/atendimento/${x.id}`} className="font-medium text-fg hover:text-brand hover:underline">
                              {n.titulo}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-fg-secondary">{x.sectorCode ? sectorLabel(maps.labels, x.sectorCode) : "Triagem"}</td>
                          <td className="px-4 py-2.5 text-fg-secondary">{quem ? (pessoa.get(quem) ?? "—") : "—"}</td>
                          <td className="px-4 py-2.5 text-fg-secondary">{x.situacao === "ENCERRADO" ? (x.desfechoTexto ?? "Encerrado") : ROTULO_DA_SITUACAO[x.situacao]}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{duracaoLegivel(primeira)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{duracaoLegivel(duracao)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{x.nota ?? (x.notaPedidaEm ? "sem resposta" : "—")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </PageContainer>
  );
}

function Tabela({ titulo, primeira, linhas, nome }: { titulo: string; primeira: string; linhas: LinhaDoGrupo[]; nome: (chave: string | null) => string }) {
  return (
    <section>
      <h3 className="text-ui font-semibold text-fg mb-2">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="text-ui text-fg-muted">Nada no período.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[520px] text-ui">
            <thead>
              <tr className="border-b border-border text-left text-micro text-fg-muted">
                <th className="px-4 py-2.5 font-medium">{primeira}</th>
                <th className="px-4 py-2.5 font-medium text-right">Atendimentos</th>
                <th className="px-4 py-2.5 font-medium text-right">1ª resposta</th>
                <th className="px-4 py-2.5 font-medium text-right">Até encerrar</th>
                <th className="px-4 py-2.5 font-medium text-right">Nota</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave ?? "-"} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5 text-fg">{nome(l.chave)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {l.total}
                    <span className="text-fg-muted"> ({l.encerrados} enc.)</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{duracaoLegivel(l.primeiraResposta)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{duracaoLegivel(l.ateEncerrar)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{l.notaMedia === null ? "—" : `${nota(l.notaMedia)} (${l.notas})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
