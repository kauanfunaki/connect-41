import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Briefcase, CalendarClock, Inbox, Repeat } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { FormularioDaAberturaDosProcessos } from "@/components/kanban/FormularioDaAberturaDosProcessos";
import { getAuthContext, canManageSector, canViewSector, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { formatInstantDate, formatarNumero } from "@/lib/format";
import { boardPath } from "@/lib/kanbanPaths";
import { painelDaAbertura } from "@/lib/kanban/aberturaAutomaticaServidor";
import { NOME_DA_LISTA_DOS_PROCESSOS, NOME_DO_ESPACO_DOS_PROCESSOS, resumoDoDestino } from "@/lib/kanban/aberturaAutomatica";
import { salvarAberturaDosProcessos } from "./actions";

/**
 * "Abertura automática" do setor (27/11/2026, funcionalidade-872): de onde as
 * tarefas do setor nascem sozinhas no Quadro de tarefas, numa tela só.
 *
 * Mora no Quadro de tarefas do setor, e não em Configurações › Setores: é do
 * setor (cada um vê e configura o seu), e quem coordena o setor — quem cria
 * espaço e lista — chega aqui pelo botão do Quadro, sem precisar ser
 * administrador. Os processos societários se configuram aqui; as outras origens
 * têm tela própria, e esta mostra o que há e leva até ela.
 */
export default async function AberturaAutomaticaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await getAuthContext();
  if (!canViewSector(ctx, code)) notFound();

  const [{ labels }, painel] = await Promise.all([getSectorMaps(ctx.tenantId), painelDaAbertura(ctx.tenantId, code)]);
  const setor = sectorLabel(labels, code);
  const coordena = canManageSector(ctx, code);
  const admin = isFullWrite(ctx.role);
  const p = painel.processos;
  const assuntosComCartao = painel.solicitacoes.assuntos.filter((a) => a.ativo && a.lista).length;
  const assuntosAtivos = painel.solicitacoes.assuntos.filter((a) => a.ativo).length;
  const nomeDaPadrao = `${NOME_DO_ESPACO_DOS_PROCESSOS} › ${NOME_DA_LISTA_DOS_PROCESSOS}`;

  return (
    <PageContainer>
      <Breadcrumb
        className="mb-1!"
        items={[{ label: `Quadro de tarefas · ${setor}`, href: `/setor/${code}` }, { label: "Abertura automática" }]}
      />
      <PageHeader title="Abertura automática" subtitle={`De onde as tarefas de ${setor} nascem sozinhas no Quadro de tarefas.`} />

      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
        {/* ── Processos societários: configurável aqui ── */}
        <Origem
          icone={<Briefcase size={16} aria-hidden />}
          nome="Processos societários"
          descricao="Cada processo aberto vira um cartão, na coluna da situação dele. O cartão anda sozinho com o processo."
          estado={
            !p.doSetor || !p.moduloLigado ? (
              <Selo tom="neutro">Não se aplica</Selo>
            ) : p.destino.ligada ? (
              <Selo tom="sucesso">Ligada</Selo>
            ) : (
              <Selo tom="neutro">Desligada</Selo>
            )
          }
        >
          {!p.moduloLigado ? (
            <p className="text-fs-2 text-fg-muted">Os Processos estão desligados neste escritório.</p>
          ) : !p.doSetor ? (
            <p className="text-fs-2 text-fg-muted">
              Os processos são do setor {p.setorDoModulo ? sectorLabel(labels, p.setorDoModulo) : "que opera os Processos"}: a abertura deles se configura no
              Quadro de tarefas de lá.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-fs-2 text-fg-secondary">{resumoDoDestino(p.destino, p.nomeDaEscolhida)}</p>
              {coordena ? (
                <FormularioDaAberturaDosProcessos
                  action={salvarAberturaDosProcessos.bind(null, code)}
                  ligada={p.destino.ligada}
                  pipelineId={p.pipelineId}
                  grupos={p.grupos.map((g) => ({ espaco: g.espaco, listas: g.listas.map((l) => ({ id: l.id, nome: l.nome })) }))}
                  nomeDaPadrao={nomeDaPadrao}
                />
              ) : (
                <p className="text-fs-2 text-fg-muted">Quem muda é a coordenação do setor.</p>
              )}
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fs-2 text-fg-muted">
                <span>
                  {formatarNumero(p.cartoes, 0)} {p.cartoes === 1 ? "cartão aberto por processo" : "cartões abertos por processos"}
                </span>
                {p.listaPadrao && (
                  <Link href={boardPath({ id: p.listaPadrao.id })} className="text-brand hover:underline">
                    Abrir {p.listaPadrao.nome}
                  </Link>
                )}
                {p.atualizadoEm && (
                  <span>
                    Mudou em {formatInstantDate(p.atualizadoEm)}
                    {p.atualizadoPor ? ` por ${p.atualizadoPor}` : ""}
                  </span>
                )}
              </p>
              <p className="text-fs-1 text-fg-muted">
                Trocar a lista vale para os processos novos; os cartões que já existem ficam onde estão. Desligar não apaga cartão nenhum: os que
                existem seguem acompanhando os processos.
              </p>
            </div>
          )}
        </Origem>

        {/* ── Solicitações do cliente: por assunto ── */}
        <Origem
          icone={<Inbox size={16} aria-hidden />}
          nome="Solicitações do cliente"
          descricao="A solicitação vira cartão conforme o assunto: cada assunto escolhe a lista dele."
          estado={
            !painel.solicitacoes.moduloLigado ? (
              <Selo tom="neutro">Desligadas</Selo>
            ) : (
              <Selo tom={assuntosComCartao > 0 ? "sucesso" : "neutro"}>Por assunto</Selo>
            )
          }
          acao={
            admin && (
              <Button href="/admin/assuntos" variant="secondary" size="xs">
                Configurar os assuntos <ArrowRight size={12} aria-hidden />
              </Button>
            )
          }
        >
          {painel.solicitacoes.assuntos.length === 0 ? (
            <p className="text-fs-2 text-fg-muted">Nenhum assunto atendido por este setor.</p>
          ) : (
            <BlocoRecolhivel titulo="Assuntos do setor" resumo={`${assuntosComCartao} de ${assuntosAtivos} ${assuntosAtivos === 1 ? "assunto vira" : "assuntos viram"} cartão`}>
              <ul className="flex flex-col divide-y divide-border">
                {painel.solicitacoes.assuntos.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5 text-fs-2">
                    <span className={`truncate ${a.ativo ? "text-fg" : "text-fg-muted"}`} title={a.nome}>
                      {a.nome}
                      {!a.ativo && " (inativo)"}
                    </span>
                    <span className={`truncate ${a.lista ? "text-fg-secondary" : "text-fg-muted"}`} title={a.lista ?? undefined}>
                      {a.lista ?? "Não vira cartão"}
                    </span>
                  </li>
                ))}
              </ul>
            </BlocoRecolhivel>
          )}
          {!admin && <p className="mt-2 text-fs-1 text-fg-muted">Os assuntos se configuram em Configurações › Portal do cliente, pela administração.</p>}
        </Origem>

        {/* ── Obrigações recorrentes ── */}
        <Origem
          icone={<Repeat size={16} aria-hidden />}
          nome="Obrigações recorrentes"
          descricao="Uma tarefa por período (dia, semana, quinzena ou mês), na lista escolhida em cada obrigação."
          estado={<Selo tom={painel.recorrentes.ativas > 0 ? "sucesso" : "neutro"}>{contagem(painel.recorrentes.ativas, "ativa", "ativas")}</Selo>}
          acao={
            admin && (
              <Button href="/admin/obrigacoes" variant="secondary" size="xs">
                Ver as obrigações <ArrowRight size={12} aria-hidden />
              </Button>
            )
          }
        >
          <p className="text-fs-2 text-fg-muted">
            {painel.recorrentes.total === 0
              ? "Nenhuma obrigação recorrente deste setor."
              : `${contagem(painel.recorrentes.ativas, "ativa", "ativas")} de ${painel.recorrentes.total} deste setor.`}
            {!admin && " Quem configura é a administração."}
          </p>
        </Origem>

        {/* ── Obrigações por regime ── */}
        <Origem
          icone={<CalendarClock size={16} aria-hidden />}
          nome="Obrigações por regime"
          descricao="O modelo gera as obrigações das próximas competências das empresas que batem com a regra."
          estado={<Selo tom={painel.porRegime.ativos > 0 ? "sucesso" : "neutro"}>{contagem(painel.porRegime.ativos, "modelo ativo", "modelos ativos")}</Selo>}
          acao={
            (admin || coordena) && (
              <Button href="/admin/obrigacoes/regime" variant="secondary" size="xs">
                Ver os modelos <ArrowRight size={12} aria-hidden />
              </Button>
            )
          }
        >
          <p className="text-fs-2 text-fg-muted">
            {painel.porRegime.total === 0
              ? "Nenhum modelo de obrigação por regime deste setor."
              : `${contagem(painel.porRegime.ativos, "modelo ativo", "modelos ativos")} de ${painel.porRegime.total} deste setor.`}
          </p>
        </Origem>
      </div>
    </PageContainer>
  );
}

function contagem(n: number, um: string, varios: string): string {
  return `${formatarNumero(n, 0)} ${n === 1 ? um : varios}`;
}

/** Uma origem: o nome e o que faz à esquerda; o estado, a ação e o detalhe à direita. */
function Origem({
  icone,
  nome,
  descricao,
  estado,
  acao,
  children,
}: {
  icone: React.ReactNode;
  nome: string;
  descricao: string;
  estado: React.ReactNode;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={nome} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-6">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-fs-4 font-semibold text-fg">
          <span className="text-fg-muted">{icone}</span>
          {nome}
        </h2>
        <p className="mt-1 text-fs-2 text-fg-muted">{descricao}</p>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {estado}
          {acao}
        </div>
        {children}
      </div>
    </section>
  );
}
