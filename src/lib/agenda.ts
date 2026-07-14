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
