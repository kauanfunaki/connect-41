import type { Prioridade } from "./regras";

export const SLA_PADRAO: Record<Prioridade, { firstResponseMinutes: number; resolutionMinutes: number }> = {
  URGENTE: { firstResponseMinutes: 60, resolutionMinutes: 480 }, ALTA: { firstResponseMinutes: 240, resolutionMinutes: 1440 },
  MEDIA: { firstResponseMinutes: 480, resolutionMinutes: 4320 }, BAIXA: { firstResponseMinutes: 1440, resolutionMinutes: 10080 },
};
// Calendário do helpdesk do Hub: segunda a quinta 08–18, sexta 08–17.
// Representar o relógio civil com getUTC/setUTC evita o TZ do host. O offset
// vem da zona IANA, inclusive para datas em que Brasília teve horário de verão.
const calendario = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function relogioCivil(instante: Date) {
  if (!Number.isFinite(instante.getTime())) throw new Error("Data de SLA inválida.");
  const p = Object.fromEntries(calendario.formatToParts(instante).filter(v => v.type !== "literal").map(v => [v.type, Number(v.value)]));
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, instante.getUTCMilliseconds()));
}
function instanteDoRelogio(civil: Date) {
  let resultado = new Date(civil);
  for (let i = 0; i < 4; i++) {
    const ajuste = civil.getTime() - relogioCivil(resultado).getTime();
    if (!ajuste) return resultado;
    resultado = new Date(resultado.getTime() + ajuste);
  }
  throw new Error("Não foi possível determinar o horário do SLA.");
}
const fim = (dia: number) => dia >= 1 && dia <= 4 ? 18 : dia === 5 ? 17 : 0;
function proximoDia(d: Date) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(8, 0, 0, 0); }
export function somarMinutosUteis(inicio: Date, minutos: number): Date {
  if (!Number.isFinite(minutos) || minutos < 0 || minutos > 525600) throw new Error("Prazo de SLA inválido.");
  const d = relogioCivil(inicio);
  let restante = minutos;
  while (restante > 0) {
    const horaFinal = fim(d.getUTCDay());
    if (!horaFinal || d.getUTCHours() >= horaFinal) { proximoDia(d); continue; }
    if (d.getUTCHours() < 8) d.setUTCHours(8, 0, 0, 0);
    const limite = new Date(d); limite.setUTCHours(horaFinal, 0, 0, 0);
    const passo = Math.min(restante, (limite.getTime() - d.getTime()) / 60000);
    d.setTime(d.getTime() + passo * 60000); restante -= passo;
  }
  return instanteDoRelogio(d);
}
export function minutosUteisEntre(inicio: Date, final: Date): number {
  const d = relogioCivil(inicio), ate = relogioCivil(final);
  let total = 0;
  while (d < ate) {
    const horaFinal = fim(d.getUTCDay());
    if (!horaFinal || d.getUTCHours() >= horaFinal) { proximoDia(d); continue; }
    if (d.getUTCHours() < 8) d.setUTCHours(8, 0, 0, 0);
    const limite = new Date(d); limite.setUTCHours(horaFinal, 0, 0, 0);
    const ultimo = Math.min(ate.getTime(), limite.getTime());
    total += Math.max(0, ultimo - d.getTime()) / 60000; proximoDia(d);
  }
  return Math.round(total);
}
