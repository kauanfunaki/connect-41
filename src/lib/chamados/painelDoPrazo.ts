import { saoPauloParts } from "@/lib/agenda";
import { emTriagem, fechado } from "./regras";
import { minutosUteisEntre } from "./sla";

/**
 * O que a faixa do cartão "Atendimento" mostra (05/11/2026, opção A da tela do
 * chamado): o prazo de resolução grande, quanto falta, a primeira resposta e a
 * barra do SLA. Só leitura do ciclo: nada aqui decide prazo, pausa ou situação
 * — isso continua em `sla.ts` e nas actions.
 *
 * O tempo que falta é em horas úteis, o mesmo relógio do SLA (segunda a quinta
 * 08–18, sexta 08–17). Em relógio de parede, "faltam 14 h" às 18h de quinta
 * seria mentira: o prazo vence às 10h de sexta, com 2 h úteis.
 */
export type CicloDoPainel = {
  openedAt: Date | string;
  firstResponseDueAt: Date | string;
  resolutionDueAt: Date | string;
  firstResponseAt: Date | string | null;
  resolvedAt: Date | string | null;
  pausedAt: Date | string | null;
  pausedMinutes: number;
  manualDeadline: boolean;
};

/** O tom da barra. O texto do `rotulo` vai sempre junto: a cor nunca é a única pista. */
export type TomDoPrazo = "ok" | "atencao" | "perigo" | "pausado" | "resolvido";

export type PainelDoPrazo = {
  titulo: string;
  /** "faltam 2 h 10 min úteis", "atrasado há 40 min úteis", "SLA pausado desde…". */
  restante: string | null;
  primeiraResposta: string | null;
  /** 0 a 1, o quanto do prazo já foi usado. `null` sem barra. */
  usado: number | null;
  tom: TomDoPrazo;
  rotulo: string;
};

/** A partir daqui o prazo vira atenção (âmbar). */
export const LIMITE_DE_ATENCAO = 0.75;

const data = (v: Date | string) => new Date(v);
const hora = (d: Date) => { const p = saoPauloParts(d); return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`; };
const diaEmMs = (dateKey: string) => Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)));

/** "hoje, 14:30", "amanhã, 09:00", "ontem, 17:00", "12/11, 10:00" ou "12/11/2027, 10:00" — no relógio de Brasília. */
export function quandoCurto(quando: Date, agora: Date): string {
  const q = saoPauloParts(quando), a = saoPauloParts(agora);
  const dias = Math.round((diaEmMs(q.dateKey) - diaEmMs(a.dateKey)) / 86_400_000);
  const dia = dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dias === -1 ? "ontem"
    : `${String(q.day).padStart(2, "0")}/${String(q.month).padStart(2, "0")}${q.year !== a.year ? `/${q.year}` : ""}`;
  return `${dia}, ${hora(quando)}`;
}

/** "45 min", "2 h", "2 h 10 min". */
export function duracao(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), resto = m % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

export function painelDoPrazo(ciclo: CicloDoPainel | undefined, status: string, agora: Date): PainelDoPrazo {
  if (!ciclo) {
    if (fechado(status)) return { titulo: "Chamado encerrado", restante: null, primeiraResposta: null, usado: null, tom: "resolvido", rotulo: "Encerrado" };
    if (emTriagem(status)) return { titulo: "Triagem em andamento", restante: "O SLA começa depois, quando o atendimento passa para Em andamento.", primeiraResposta: null, usado: null, tom: "pausado", rotulo: "Sem SLA" };
    return { titulo: "SLA ainda não começou", restante: "Começa quando o atendimento passa para Em andamento.", primeiraResposta: null, usado: null, tom: "pausado", rotulo: "Sem SLA" };
  }
  const aberto = data(ciclo.openedAt), vence = data(ciclo.resolutionDueAt);
  const total = Math.max(1, minutosUteisEntre(aberto, vence) - ciclo.pausedMinutes);
  const respondeuEm = ciclo.firstResponseAt ? minutosUteisEntre(aberto, data(ciclo.firstResponseAt)) : 0;
  const primeiraResposta = ciclo.firstResponseAt
    ? `primeira resposta em ${respondeuEm < 1 ? "menos de 1 min" : duracao(respondeuEm)}`
    : data(ciclo.firstResponseDueAt) < agora ? `primeira resposta atrasada (era até ${quandoCurto(data(ciclo.firstResponseDueAt), agora)})`
    : `primeira resposta até ${quandoCurto(data(ciclo.firstResponseDueAt), agora)}`;
  const ajustado = ciclo.manualDeadline ? " (ajustado)" : "";

  if (ciclo.resolvedAt) {
    const resolvido = data(ciclo.resolvedAt), noPrazo = resolvido <= vence;
    return { titulo: `Resolvido ${quandoCurto(resolvido, agora)}`, restante: `O prazo era ${quandoCurto(vence, agora)}${ajustado}.`, primeiraResposta, usado: 1, tom: noPrazo ? "resolvido" : "perigo", rotulo: noPrazo ? "Resolvido no prazo" : "Resolvido fora do prazo" };
  }
  if (fechado(status)) return { titulo: "Chamado encerrado", restante: `O prazo era ${quandoCurto(vence, agora)}${ajustado}.`, primeiraResposta, usado: null, tom: "resolvido", rotulo: "Encerrado" };

  const titulo = `Resolver até ${quandoCurto(vence, agora)}${ajustado}`;
  if (ciclo.pausedAt) {
    const pausa = data(ciclo.pausedAt);
    const usado = Math.min(1, Math.max(0, (total - minutosUteisEntre(pausa, vence)) / total));
    return { titulo, restante: `SLA pausado desde ${quandoCurto(pausa, agora)}`, primeiraResposta, usado, tom: "pausado", rotulo: "Pausado" };
  }
  if (vence < agora) return { titulo, restante: `atrasado há ${duracao(minutosUteisEntre(vence, agora))} úteis`, primeiraResposta, usado: 1, tom: "perigo", rotulo: "Atrasado" };
  const falta = minutosUteisEntre(agora, vence);
  const usado = Math.min(1, Math.max(0, (total - falta) / total));
  return { titulo, restante: `faltam ${duracao(falta)} úteis`, primeiraResposta, usado, tom: usado >= LIMITE_DE_ATENCAO ? "atencao" : "ok", rotulo: usado >= LIMITE_DE_ATENCAO ? "Perto do prazo" : "No prazo" };
}
