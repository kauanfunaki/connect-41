import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Columns3,
  Loader,
  PauseCircle,
  PlayCircle,
  Sparkles,
  UserX,
  Video,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { ConfigurarTarefasButton } from "@/components/tarefas/ConfigurarTarefasButton";
import { LinhaDoDia } from "@/components/tarefas/LinhaDoDia";
import { PrazoItem } from "@/components/agenda/PrazoItem";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, scopedSectors } from "@/lib/auth/context";
import { getSectorMaps, getActiveSectors } from "@/lib/sectors";
import { parseTaskWidgets, visibleTaskWidgets, type TaskWidgetKey } from "@/lib/taskWidgets";
import { itensDaGestao } from "@/lib/gestao/itens";
import { cargaPorPessoa, recorteDaGestao, type CargaDaPessoa } from "@/lib/gestao/regras";
import { LinhasDeSituacao, type LinhaDeSituacao, type Segmento } from "@/components/shared/Graficos";
import { nomesDasPessoas } from "@/lib/gestao/telas";
import { andando, paraComecar, pedeAgora, resumirDia } from "@/lib/meuDia";
import { prazosDoPeriodo } from "@/lib/prazosDaAgenda";
import { addDaysToKey, saoPauloParts, weekdayLabel } from "@/lib/agenda";
import { formatCalendarDate, formatInstantDate, formatInstantTime, formatarNumero } from "@/lib/format";
import { salvarWidgetsSetor, restaurarWidgetsSetor } from "./actions";

export const dynamic = "force-dynamic";

/** Quantos itens cada bloco mostra antes do "+N". */
const POR_BLOCO = 8;

// Meu dia (30/09) — a antiga tela de Tarefas, virada na primeira tela do
// expediente. Pedido do Kauan: ao começar o dia, a pessoa abre aqui para ver o
// que precisa fazer; é a Gestão (que mede tudo o que está rodando) em escala
// de uma pessoa, e o coordenador troca para o time.
//
// Os itens são os mesmos da Gestão — processo, card, pendência e
// transferência —, com a mesma régua de parado e de prazo (`classificar`).
// "Meu" é onde a pessoa responde; "Meu time" são os setores que ela coordena.
//
// A configuração por setor (SectorTaskView, do SUPER_ADMIN) continua valendo:
// sem "transferências" ou sem "cards", essas origens saem; sem "reuniões", o
// bloco de reuniões sai.
type ItemDoDia = Awaited<ReturnType<typeof itensDaGestao>>[number];

/** Um bloco do Meu dia: título, contagem e os itens (até POR_BLOCO). */
function Bloco({
  titulo,
  icone,
  lista,
  vazio,
  visaoTime,
  setores,
  nomeDe,
}: {
  titulo: string;
  icone: React.ReactNode;
  lista: ItemDoDia[];
  vazio: string;
  visaoTime: boolean;
  setores: Record<string, { rotulo: string; cor: string }>;
  nomeDe: Map<string, string>;
}) {
  const resto = lista.length - POR_BLOCO;
  return (
    <section className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <h2 className="flex items-center gap-2 text-[length:var(--fs-card-title)] font-semibold text-fg [&>svg]:size-4 [&>svg]:text-fg-muted">
          {icone}
          {titulo}
        </h2>
        <span className="text-[12px] text-fg-muted tnum">{lista.length}</span>
      </header>
      {lista.length === 0 ? (
        <p className="px-4 py-5 text-[length:var(--fs-body)] text-fg-muted">{vazio}</p>
      ) : (
        <ul className="divide-y divide-border">
          {lista.slice(0, POR_BLOCO).map((x) => (
            <LinhaDoDia
              key={`${x.item.origem}-${x.item.id}`}
              item={x.item}
              c={x.c}
              setor={setores[x.item.setor] ?? { rotulo: x.item.setor, cor: "#586577" }}
              responsaveis={visaoTime ? x.item.responsaveis.map((id) => nomeDe.get(id) ?? "—") : undefined}
            />
          ))}
        </ul>
      )}
      {resto > 0 && (
        <p className="px-4 py-2.5 border-t border-border text-[12px] text-fg-muted">
          + {resto} {resto === 1 ? "outro" : "outros"} — veja todos no{" "}
          <Link href="/kanban" className="font-medium text-fg-secondary hover:text-brand">
            quadro de tarefas
          </Link>
          {visaoTime && (
            <>
              {" "}ou na{" "}
              <Link href="/gestao" className="font-medium text-fg-secondary hover:text-brand">
                Gestão
              </Link>
            </>
          )}
          .
        </p>
      )}
    </section>
  );
}

/**
 * A carga de uma pessoa como linha do gráfico de situação (07/10, auditoria
 * dos gráficos): era uma barrinha de 6px à mão com "2 atrasados · 1 parado" em
 * texto. Cada item cai numa situação só — a mais urgente, na régua do topo
 * da tela (`resumirDia`): atrasado, parado, vence em breve, e o resto em dia.
 */
function linhaDaCarga(p: CargaDaPessoa, nome: string): LinhaDeSituacao {
  const n = { atrasado: 0, parado: 0, vencendo: 0, em_dia: 0 };
  for (const { c } of p.itens) {
    if (c.prazo?.situacao === "VENCIDO") n.atrasado++;
    else if (c.coluna === "PARADO") n.parado++;
    else if (c.prazo?.situacao === "VENCENDO") n.vencendo++;
    else n.em_dia++;
  }
  const segmentos: Segmento[] = [
    { chave: "atrasado", rotulo: "Atrasados", valor: n.atrasado, tom: "critico" },
    { chave: "parado", rotulo: "Parados", valor: n.parado, tom: "atencao" },
    { chave: "vencendo", rotulo: "Vencem em breve", valor: n.vencendo, tom: "proximo" },
    { chave: "em_dia", rotulo: "Em dia", valor: n.em_dia, tom: "neutro" },
  ];
  return { chave: p.userId, rotulo: nome, segmentos };
}

export default async function MeuDiaPage({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  const ctx = await getAuthContext();
  const params = await searchParams;
  const prisma = getPrisma();
  const agora = new Date();
  const hojeKey = saoPauloParts(agora).dateKey;

  const recorte = recorteDaGestao(ctx);
  const podeVerTime = recorte !== null;
  const visaoTime = params.visao === "time" && podeVerTime;
  // Com setor ativo, as duas visões ficam nele (quando é um setor que a pessoa coordena).
  const setoresDaVisao: "todos" | string[] = visaoTime
    ? recorte === "todos"
      ? ctx.activeSector
        ? [ctx.activeSector]
        : "todos"
      : ctx.activeSector && recorte!.includes(ctx.activeSector)
        ? [ctx.activeSector]
        : recorte!
    : ctx.activeSector
      ? [ctx.activeSector]
      : "todos";

  const [{ labels, colors }, taskViews] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    prisma.sectorTaskView.findMany({ where: { tenantId: ctx.tenantId }, select: { sectorCode: true, widgets: true } }),
  ]);
  const configBySector: Record<string, TaskWidgetKey[]> = {};
  for (const v of taskViews) configBySector[v.sectorCode] = parseTaskWidgets(v.widgets);
  const visiveis = new Set(visibleTaskWidgets(scopedSectors(ctx) ?? ctx.sectors, configBySector));
  const mostraReunioes = visiveis.has("reunioes");

  const podeConfigurar = ctx.role === "SUPER_ADMIN";
  const setoresParaConfigurar = podeConfigurar
    ? (await getActiveSectors(ctx.tenantId)).map((s) => ({ code: s.code, label: s.label }))
    : [];

  const [todos, reunioes, prazos] = await Promise.all([
    itensDaGestao(ctx.tenantId, setoresDaVisao, agora, visaoTime ? {} : { responsavel: ctx.userId }),
    mostraReunioes && ctx.userId
      ? prisma.meeting.findMany({
          where: {
            tenantId: ctx.tenantId,
            endAt: { gte: agora },
            OR: [{ createdByUserId: ctx.userId }, { attendees: { some: { userId: ctx.userId } } }],
          },
          orderBy: { startAt: "asc" },
          take: 4,
          select: { id: true, title: true, startAt: true, meetingUrl: true },
        })
      : Promise.resolve([]),
    prazosDoPeriodo(ctx, hojeKey, addDaysToKey(hojeKey, 6)),
  ]);

  const itens = todos.filter(
    (x) =>
      (x.item.origem !== "TRANSFERENCIA" || visiveis.has("transferencias")) && (x.item.origem !== "CARD" || visiveis.has("cards-kanban"))
  );
  const resumo = resumirDia(itens, agora);
  const agoraLista = pedeAgora(itens);
  const andandoLista = andando(itens);
  const filaLista = paraComecar(itens);

  const carga = visaoTime
    ? Array.from(cargaPorPessoa(itens).values()).sort((a, b) => b.vencidos - a.vencidos || b.abertos - a.abertos)
    : [];
  const semResponsavel = visaoTime ? itens.filter((x) => x.c.coluna !== "CONCLUIDO" && x.item.responsaveis.length === 0).length : 0;
  const nomeDe = visaoTime ? await nomesDasPessoas(ctx.tenantId, itens.flatMap((x) => x.item.responsaveis)) : new Map<string, string>();

  const setorDe = (code: string) => ({ rotulo: labels[code] ?? code, cor: colors[code] ?? "#586577" });
  const setores = Object.fromEntries(Object.keys(labels).map((code) => [code, setorDe(code)]));

  const quantosPedem = agoraLista.length;
  const dataDeHoje = formatInstantDate(agora, { weekday: "long", day: "numeric", month: "long" });
  const subtitulo = visaoTime
    ? `${dataDeHoje} · ${quantosPedem ? `${quantosPedem} ${quantosPedem === 1 ? "item pede" : "itens pedem"} o time agora` : "nada pede o time agora"}`
    : `${dataDeHoje} · ${quantosPedem ? `${quantosPedem} ${quantosPedem === 1 ? "coisa pede" : "coisas pedem"} você agora` : "nada atrasado nem parado"}`;

  const prazosPorDia = new Map<string, typeof prazos>();
  for (const p of prazos) prazosPorDia.set(p.dia, [...(prazosPorDia.get(p.dia) ?? []), p]);
  const diasComPrazo = Array.from(prazosPorDia.keys()).sort();

  const contexto = { visaoTime, setores, nomeDe };

  return (
    <PageContainer>
      <PageHeader
        title={visaoTime ? "Meu time" : "Meu dia"}
        subtitle={<span className="first-letter:uppercase inline-block">{subtitulo}</span>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {podeVerTime && (
              <SegmentedControl
                label="Visão"
                active={visaoTime ? "time" : "meu"}
                items={[
                  { key: "meu", label: "Meu dia", href: "/tarefas" },
                  { key: "time", label: "Meu time", href: "/tarefas?visao=time" },
                ]}
              />
            )}
            {podeConfigurar && (
              <ConfigurarTarefasButton
                sectors={setoresParaConfigurar}
                configBySector={configBySector}
                saveAction={salvarWidgetsSetor}
                resetAction={restaurarWidgetsSetor}
              />
            )}
            <Button href="/kanban" variant="secondary" size="sm">
              <Columns3 size={14} /> Quadros
            </Button>
          </div>
        }
      />

      <FaixaDeTotais
        itens={[
          {
            rotulo: "Atrasados",
            valor: formatarNumero(resumo.atrasados, 0),
            icone: <AlarmClock />,
            tom: resumo.atrasados > 0 ? "text-danger" : undefined,
            detalhe: "prazo já passou",
          },
          {
            rotulo: "Vencem em breve",
            valor: formatarNumero(resumo.vencendo, 0),
            icone: <CalendarClock />,
            tom: resumo.vencendo > 0 ? "text-warning-fg" : undefined,
            detalhe: "nos próximos dias",
          },
          {
            rotulo: "Parados",
            valor: formatarNumero(resumo.parados, 0),
            icone: <PauseCircle />,
            tom: resumo.parados > 0 ? "text-warning-fg" : undefined,
            detalhe: "sem movimento ou esperando",
          },
          { rotulo: "Em andamento", valor: formatarNumero(resumo.andamento, 0), icone: <Loader />, detalhe: "alguém está fazendo" },
          {
            rotulo: "Feitos na semana",
            valor: formatarNumero(resumo.concluidosNaSemana, 0),
            icone: <CheckCircle2 />,
            tom: resumo.concluidosNaSemana > 0 ? "text-success-fg" : undefined,
            detalhe: "últimos 7 dias",
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Bloco
            {...contexto}
            titulo={visaoTime ? "Pede o time agora" : "Pede você agora"}
            icone={<AlarmClock />}
            lista={agoraLista}
            vazio={visaoTime ? "Nada atrasado nem parado no time." : "Nada atrasado nem parado. Bom trabalho."}
          />
          <Bloco {...contexto} titulo="Em andamento" icone={<Loader />} lista={andandoLista} vazio="Nada em andamento sem alerta." />
          <Bloco
            {...contexto}
            titulo="Para começar"
            icone={<PlayCircle />}
            lista={filaLista}
            vazio={visaoTime ? "Nada na fila do time." : "Nada na sua fila."}
          />
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          {visaoTime && (
            <section className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
              <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Carga do time</h2>
                {semResponsavel > 0 && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning-fg">
                    <UserX size={13} /> {semResponsavel} sem responsável
                  </span>
                )}
              </header>
              {carga.length === 0 ? (
                <p className="px-4 py-5 text-[length:var(--fs-body)] text-fg-muted">Ninguém com item em aberto.</p>
              ) : (
                <div className="px-4 py-3.5">
                  <LinhasDeSituacao
                    titulo="Itens em aberto por pessoa e situação"
                    linhas={carga.slice(0, 10).map((p) => linhaDaCarga(p, nomeDe.get(p.userId) ?? "—"))}
                  />
                </div>
              )}
            </section>
          )}

          {mostraReunioes && (
            <section className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
              <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Video size={16} className="text-fg-muted" />
                <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Próximas reuniões</h2>
              </header>
              {reunioes.length === 0 ? (
                <p className="px-4 py-5 text-[length:var(--fs-body)] text-fg-muted">Nenhuma reunião marcada.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {reunioes.map((m) => {
                    const hoje = saoPauloParts(m.startAt).dateKey === hojeKey;
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-fg">{m.title}</p>
                          <p className="text-[12px] text-fg-muted tnum">
                            {hoje ? "Hoje" : formatInstantDate(m.startAt, { weekday: "short", day: "2-digit", month: "2-digit" })},{" "}
                            {formatInstantTime(m.startAt, { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <Button href={m.meetingUrl} target="_blank" rel="noopener noreferrer" variant={hoje ? "primary" : "secondary"} size="xs">
                          Entrar
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <section className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
            <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
              <h2 className="flex items-center gap-2 text-[length:var(--fs-card-title)] font-semibold text-fg">
                <CalendarDays size={16} className="text-fg-muted" /> Prazos da semana
              </h2>
              <Link href="/agenda?view=semana" className="text-[12px] font-medium text-fg-secondary hover:text-brand">
                Abrir agenda
              </Link>
            </header>
            {diasComPrazo.length === 0 ? (
              <p className="px-4 py-5 text-[length:var(--fs-body)] text-fg-muted">
                <Sparkles size={14} className="inline -mt-0.5 mr-1 text-fg-muted" />
                Nenhum prazo nos seus setores nos próximos 7 dias.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {diasComPrazo.map((dia) => (
                  <li key={dia} className="px-4 py-2.5">
                    <p className="mb-1.5 text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                      {dia === hojeKey
                        ? "Hoje"
                        : dia === addDaysToKey(hojeKey, 1)
                          ? "Amanhã"
                          : `${weekdayLabel(dia)}, ${formatCalendarDate(new Date(`${dia}T12:00:00Z`), { day: "2-digit", month: "2-digit" })}`}
                    </p>
                    <div className="space-y-1">
                      {prazosPorDia.get(dia)!.slice(0, 5).map((p) => (
                        <PrazoItem key={p.chave} prazo={p} setores={setores} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
