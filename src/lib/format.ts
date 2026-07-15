// Formatação central de datas — nunca usar toLocaleDateString/toLocaleString
// direto num Date fora daqui (ver eslint.config.mjs). Duas famílias de campo,
// duas timezones diferentes, mesma razão: exibir sempre o mesmo dia/hora
// independente do fuso do processo Node (UTC em produção, America/Sao_Paulo
// ou outro em dev — variar isso mudava o resultado exibido).
//
// - Datas-calendário (nascimento, feriado, admissão, férias, data de exame...)
//   vêm de <input type="date"> e são gravadas como meia-noite UTC
//   (`new Date("YYYY-MM-DD")`). Formatar com timeZone "UTC" garante que o dia
//   exibido seja sempre o dia gravado.
// - Timestamps reais (criado em, enviado em, visualizado em, solicitado em...)
//   são o instante em que algo aconteceu. Formatar com timeZone
//   "America/Sao_Paulo" garante a hora de Brasília, não a do processo Node.

export function formatCalendarDate(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC", ...opts });
}

export function formatInstantDate(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", ...opts });
}

export function formatInstantDateTime(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...opts });
}

export function formatInstantTime(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", ...opts });
}
