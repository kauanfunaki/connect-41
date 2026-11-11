"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CreateMeetingDialog } from "./CreateMeetingDialog";
import { MiniCalendar } from "./MiniCalendar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TimeGrid } from "./TimeGrid";
import { MesDosPrazos } from "./MesDosPrazos";
import { ListaDosPrazos } from "./ListaDosPrazos";
import { BotoesDeFonte } from "./BotoesDeFonte";
import { shiftAgendaDate, agendaTitle, AGENDA_VIEWS, type AgendaView } from "@/lib/agenda";
import { slotNoDia, slotParaNovaReuniao, type Expediente, type Slot } from "@/lib/agendaExpediente";
import { alternarFonte, type OrigemDasFontes } from "@/lib/agendaDoSetor";
import type { FonteDaAgenda } from "@/lib/fontesDaAgenda";
import type { MeetingState } from "@/app/(app)/agenda/actions";
import type { ActionState } from "@/lib/actionState";
import type { CalendarDay, CompanyOption, MeetingActions, MeetingRow, UserOption } from "./types";
import type { SetoresDaAgenda } from "./PrazoItem";
import type { PrazoDaAgenda } from "@/lib/prazosDaAgendaRegras";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";

const VIEW_LABEL: Record<AgendaView, string> = { prazos: "Prazos", dia: "Dia", semana: "Semana", mes: "Mês" };

const PREV_LABEL: Record<AgendaView, string> = {
  prazos: "Período anterior",
  dia: "Dia anterior",
  semana: "Semana anterior",
  mes: "Mês anterior",
};
const NEXT_LABEL: Record<AgendaView, string> = {
  prazos: "Próximo período",
  dia: "Próximo dia",
  semana: "Próxima semana",
  mes: "Próximo mês",
};

/** As fontes de prazo da pessoa: as que ela alcança, as escondidas e o padrão para onde "Restaurar padrão" volta. */
export type FontesDaTela = {
  acessiveis: FonteDaAgenda[];
  ocultas: FonteDaAgenda[];
  origem: OrigemDasFontes;
  padrao: { ocultas: FonteDaAgenda[]; origem: OrigemDasFontes };
};

type Props = {
  /** O cabeçalho da tela — desenhado aqui para o "Nova reunião" ficar nas
   *  ações dele, ao lado do título (escolha 5A, 08/10/2026). */
  titulo: string;
  subtitulo: React.ReactNode;
  /** O que vem entre o cabeçalho e a grade: a legenda dos setores e avisos. */
  antesDaGrade?: React.ReactNode;
  view: AgendaView;
  /** Data de referência da visão (dia exibido / dia dentro da semana / mês / começo dos prazos). */
  dateKey: string;
  days: CalendarDay[];
  /** Hoje em "AAAA-MM-DD" (São Paulo), o mesmo do servidor. */
  hoje: string;
  meetings: MeetingRow[];
  createAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  editAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  deleteAction?: (meetingId: string) => Promise<void>;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  allUsers: UserOption[];
  companies: CompanyOption[];
  currentUserId: string;
  /** Prazos do período — das fontes ligadas, de todos os setores que a pessoa enxerga. */
  prazos: PrazoDaAgenda[];
  setores: SetoresDaAgenda;
  /** Coordenador ou administrador: só eles criam reunião (ver canManageMeetings). */
  podeAgendar: boolean;
  /** Algum setor da pessoa usa reuniões (10/11/2026). Sem isso, nada convida a marcar reunião fora das grades de horas. */
  usaReunioes: boolean;
  fontes: FontesDaTela;
  salvarFontes: (ocultas: string[]) => Promise<ActionState>;
  restaurarFontes: () => Promise<ActionState>;
  lembrarVisao: (visao: string) => Promise<ActionState>;
  /** Horário da grade de dia/semana — o da pessoa ou o do escritório. */
  expediente: Expediente;
  /**
   * Abre mostrando só os prazos deste setor (`?setor=`): o "Ver prazos na
   * Agenda" das Exigências (04/11/2026), que substituiu a agenda própria do
   * Societário. É estado da tela, e não da URL: trocar de semana mantém o
   * filtro, e "Ver todos os setores" o tira.
   */
  setorInicial?: string | null;
};

export function agendaHref(view: AgendaView, dateKey: string): string {
  return `/agenda?view=${view}&date=${dateKey}`;
}

// Casca da Agenda: cabeçalho (título, navegação, seletor de visão) + a visão
// ativa. Dia e semana usam a mesma grade de horas (TimeGrid); Mês e Prazos
// (10/11/2026, desenhos B e A aprovados pelo Kauan) são a lista e o calendário
// dos prazos, com as fontes ligadas nos botões acima. A visão vive na URL, não
// em estado local, pra que voltar/avançar no navegador e links diretos
// funcionem; a última escolhida fica gravada para a Agenda abrir nela.
export function AgendaCalendar({
  titulo,
  subtitulo,
  antesDaGrade,
  view,
  dateKey,
  days,
  hoje,
  meetings,
  createAction,
  editAction,
  deleteAction,
  hasGoogle,
  hasMicrosoft,
  allUsers,
  companies,
  currentUserId,
  prazos,
  setores,
  podeAgendar,
  usaReunioes,
  fontes,
  salvarFontes,
  restaurarFontes,
  lembrarVisao,
  expediente,
  setorInicial = null,
}: Props) {
  const [dialogSlot, setDialogSlot] = useState<Slot | null>(null);
  const [setorFiltro, setSetorFiltro] = useState<string | null>(setorInicial && setores[setorInicial] ? setorInicial : null);
  const toast = useToast();

  // As fontes mudam na hora (otimista): esconder já some da tela; ligar
  // traz os prazos quando a gravação volta, porque fonte desligada nem é
  // buscada. Erro: o toast avisa e o estado volta ao do servidor sozinho.
  const [estado, aplicar] = useOptimistic({ ocultas: fontes.ocultas, origem: fontes.origem });
  const [, startTransition] = useTransition();

  function alternar(fonte: FonteDaAgenda, ligada: boolean) {
    const nova = alternarFonte(estado.ocultas, fonte, ligada);
    startTransition(async () => {
      aplicar({ ocultas: nova, origem: "pessoa" });
      const r = await salvarFontes(nova);
      if (r?.error) toast.error(r.error);
    });
  }

  function restaurar() {
    startTransition(async () => {
      aplicar(fontes.padrao);
      const r = await restaurarFontes();
      if (r?.error) toast.error(r.error);
      else toast.success("As fontes voltaram ao padrão do setor.");
    });
  }

  const fora = new Set(estado.ocultas);
  const prazosVistos = prazos.filter((p) => !fora.has(p.fonte) && (!setorFiltro || p.setor === setorFiltro));

  const actions: MeetingActions = { editAction, deleteAction, allUsers, companies, currentUserId };
  const grade = view === "dia" || view === "semana";
  // "Nova reunião" no cabeçalho: para quem marca reunião, sempre que o setor
  // usa reuniões; no setor que não usa, só nas grades de horas, onde a pessoa
  // foi de propósito (10/11/2026).
  const mostraNovaReuniao = podeAgendar && (usaReunioes || grade);

  // Botão "Nova reunião": cai na próxima hora cheia de hoje quando hoje está à
  // vista; senão, no primeiro dia exibido. Desde 05/10 a hora é puxada para o
  // expediente, que pode passar da meia-noite — a regra está em
  // slotParaNovaReuniao.
  function openDialogForNow() {
    setDialogSlot(slotParaNovaReuniao(expediente, days.map((d) => d.dateKey), new Date()));
  }

  return (
    <>
      <div className="flex-shrink-0">
        <PageHeader
          title={titulo}
          subtitle={subtitulo}
          action={
            mostraNovaReuniao && (
              <Button variant="primary" onClick={openDialogForNow}>
                <Plus size={14} /> Nova reunião
              </Button>
            )
          }
        />
        {antesDaGrade}
        {/* As fontes (10/11/2026): com uma só, o botão não teria o que escolher. */}
        {fontes.acessiveis.length > 1 && (
          <div className="mb-3 -mt-1">
            <BotoesDeFonte
              acessiveis={fontes.acessiveis}
              ocultas={estado.ocultas}
              origem={estado.origem}
              onAlternar={alternar}
              onRestaurar={restaurar}
            />
          </div>
        )}
        {setorFiltro && (
          <p className="mb-3 -mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-fs-2 text-fg-secondary">
            <span className="size-2.5 rounded-[3px]" style={{ background: setores[setorFiltro].cor }} aria-hidden />
            Só os prazos de {setores[setorFiltro].rotulo}.
            <Button variant="ghost" size="xs" onClick={() => setSetorFiltro(null)}>
              Ver todos os setores
            </Button>
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden h-full flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap flex-shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-section font-semibold text-fg">{agendaTitle(view, dateKey)}</h2>
              <div className="flex items-center gap-1">
                {/* As setas são o `IconButton` com `href` (15/10/2026): eram
                    `<Link>` com a classe de botão escrita à mão. */}
                <IconButton size="sm" href={agendaHref(view, shiftAgendaDate(view, dateKey, -1))} aria-label={PREV_LABEL[view]}>
                  <ChevronLeft size={15} />
                </IconButton>
                {/* Era texto com fundo no hover (30/09): "Hoje" é ação, com borda de botão. */}
                <Button href={agendaHref(view, hoje)} variant="secondary" size="xs">
                  Hoje
                </Button>
                <IconButton size="sm" href={agendaHref(view, shiftAgendaDate(view, dateKey, 1))} aria-label={NEXT_LABEL[view]}>
                  <ChevronRight size={15} />
                </IconButton>
                <MiniCalendar view={view} selectedKeys={days.map((d) => d.dateKey)} referenceKey={dateKey} />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <SegmentedControl
                label="Visão da agenda"
                active={view}
                onNavigate={(v) => {
                  // A última visão escolhida é a da próxima vez (10/11/2026).
                  // Sem esperar: a navegação do link segue sozinha.
                  void lembrarVisao(v);
                }}
                items={AGENDA_VIEWS.map((v) => ({
                  key: v,
                  label: VIEW_LABEL[v],
                  // Prazos a partir de hoje quando hoje está à vista (a semana
                  // ou o mês de agora); senão, do dia de referência.
                  href: agendaHref(v, v === "prazos" && view !== "prazos" && days.some((d) => d.isToday) ? hoje : dateKey),
                }))}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {view === "prazos" ? (
              <div className="h-full overflow-y-auto">
                <ListaDosPrazos
                  prazos={prazosVistos}
                  de={days[0].dateKey}
                  ate={days[days.length - 1].dateKey}
                  hoje={hoje}
                  temFonteDesligada={estado.ocultas.some((f) => fontes.acessiveis.includes(f))}
                />
              </div>
            ) : view === "mes" ? (
              <MesDosPrazos
                key={dateKey}
                days={days}
                monthKey={dateKey}
                prazos={prazosVistos}
                meetings={meetings}
                actions={actions}
                hoje={hoje}
                onNovaReuniao={podeAgendar && usaReunioes ? (day) => setDialogSlot(slotNoDia(expediente, day, new Date())) : undefined}
              />
            ) : (
              <TimeGrid
                days={days}
                meetings={meetings}
                actions={actions}
                onSlotClick={podeAgendar ? setDialogSlot : undefined}
                prazos={prazosVistos}
                setores={setores}
                expediente={expediente}
              />
            )}
          </div>

          {dialogSlot && (
            <CreateMeetingDialog
              action={createAction}
              initialStart={dialogSlot.start}
              initialEnd={dialogSlot.end}
              hasGoogle={hasGoogle}
              hasMicrosoft={hasMicrosoft}
              allUsers={allUsers}
              companies={companies}
              onClose={() => setDialogSlot(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}
