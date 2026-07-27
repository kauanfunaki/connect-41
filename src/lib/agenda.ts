// Helpers de data pra grade semanal da Agenda — tudo em calendário
// América/Sao_Paulo (UTC-3 fixo, sem horário de verão desde 2019), mesmo
// racional de src/lib/datetime.ts. Datas de calendário trafegam como string
// "YYYY-MM-DD"; horários de reunião continuam Date (instante UTC) no banco.

// Componentes de data/hora em America/Sao_Paulo a partir de um instante UTC —
// nunca usar Date.getHours()/getDate() direto (retornam hora do processo,
// UTC em produção, 3h adiantada da hora de Brasília).
export function saoPauloParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number; dateKey: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

// Inverso de parseSaoPauloDateTimeLocal (src/lib/datetime.ts): formata um
// instante UTC de volta pra "YYYY-MM-DDTHH:mm" em horário de Brasília, pro
// defaultValue de um <input type="datetime-local"> (ex: reabrir o form de
// edição de reunião já com o horário certo, sem o deslocamento de fuso do
// servidor).
export function toSaoPauloDateTimeLocal(d: Date): string {
  const { dateKey, hour, minute } = saoPauloParts(d);
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Converte "YYYY-MM-DDTHH:mm" (calendário Brasília) pro instante UTC correspondente.
export function saoPauloDateTimeToUtc(dateKey: string, hour: number, minute: number): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Soma/subtrai dias de um dateKey — aritmética de calendário pura via UTC,
// segura porque não há DST em Brasília; não usar pra converter em instante.
export function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// Segunda-feira (calendário Brasília) da semana que contém `dateKey` — hoje, se omitido.
export function mondayOfWeek(dateKey?: string): string {
  const key = dateKey ?? saoPauloParts(new Date()).dateKey;
  const [year, month, day] = key.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=dom .. 6=sáb
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  return addDaysToKey(key, diffToMonday);
}

// Os 7 dateKeys (segunda a domingo) a partir de uma segunda-feira.
export function weekDayKeys(mondayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(mondayKey, i));
}

const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function weekdayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return WEEKDAY_LABEL[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function dayNumber(dateKey: string): number {
  return Number(dateKey.split("-")[2]);
}

const MONTH_LABEL = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function monthYearLabel(dateKey: string): string {
  const [year, month] = dateKey.split("-").map(Number);
  const name = MONTH_LABEL[month - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${year}`;
}

const WEEKDAY_FULL = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
];

// Título da visão de dia: "Segunda-feira, 27 de julho de 2026".
export function fullDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = WEEKDAY_FULL[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${day} de ${MONTH_LABEL[month - 1]} de ${year}`;
}

// ── Visões da Agenda ────────────────────────────────────────────────────────
// A grade de dia e a de semana são a mesma coisa com 1 ou 7 colunas; a de mês
// é uma grade separada, sem eixo de horas.

export type AgendaView = "dia" | "semana" | "mes";

const AGENDA_VIEWS: AgendaView[] = ["dia", "semana", "mes"];

export function parseAgendaView(raw: string | undefined): AgendaView {
  return AGENDA_VIEWS.includes(raw as AgendaView) ? (raw as AgendaView) : "semana";
}

// Data de referência da URL — inválida ou ausente cai em hoje, então
// /agenda sem parâmetro nenhum sempre abre no presente.
export function parseAgendaDate(raw: string | undefined): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return saoPauloParts(new Date()).dateKey;
  const [year, month, day] = raw.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejeita data que o Date "consertou" (ex.: 2026-02-31 → 3 de março).
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    return saoPauloParts(new Date()).dateKey;
  }
  return raw;
}

// Dias cobertos pela visão: 1 (dia), 7 (semana, seg→dom) ou 42 (mês, 6 semanas
// completas a partir da segunda que contém o dia 1º — mesma grade do
// MiniCalendar, altura estável ao trocar de mês).
export function agendaDayKeys(view: AgendaView, dateKey: string): string[] {
  if (view === "dia") return [dateKey];
  if (view === "semana") return weekDayKeys(mondayOfWeek(dateKey));
  const firstMonday = mondayOfWeek(firstOfMonth(dateKey));
  return Array.from({ length: 42 }, (_, i) => addDaysToKey(firstMonday, i));
}

export function firstOfMonth(dateKey: string): string {
  const [year, month] = dateKey.split("-").map(Number);
  return toDateKey(year, month, 1);
}

// Soma meses preservando o dia quando possível — dia 31 em mês de 30 cai no
// último dia do mês de destino, em vez de vazar para o mês seguinte.
export function addMonthsToKey(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const total = (year * 12) + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return toDateKey(targetYear, targetMonth, Math.min(day, lastDay));
}

// Passo das setinhas de navegação, por visão.
export function shiftAgendaDate(view: AgendaView, dateKey: string, direction: -1 | 1): string {
  if (view === "dia") return addDaysToKey(dateKey, direction);
  if (view === "semana") return addDaysToKey(dateKey, direction * 7);
  return addMonthsToKey(firstOfMonth(dateKey), direction);
}

// Na semana o rótulo vem da segunda-feira, não da data clicada — semana que
// cruza a virada do mês continua nomeada pelo mês em que começa (era assim
// antes das visões existirem).
export function agendaTitle(view: AgendaView, dateKey: string): string {
  if (view === "dia") return fullDayLabel(dateKey);
  if (view === "semana") return monthYearLabel(mondayOfWeek(dateKey));
  return monthYearLabel(dateKey);
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
