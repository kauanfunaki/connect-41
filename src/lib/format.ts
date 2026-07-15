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

// Documentos brasileiros — aplica a máscara só quando a quantidade de dígitos
// bate com o formato esperado; caso contrário devolve o valor cru (dado
// incompleto/de teste não deve virar "—" nem quebrar a tela). `null`/vazio
// sempre vira "—", igual ao fallback do InfoRow.

export function formatCnpj(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

export function formatCep(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return value;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

// Mascara o miolo do CPF — dado pessoal exposto a qualquer usuário do tenant
// que tenha acesso ao registro; mantém início/fim visíveis o bastante pra
// localizar visualmente sem expor o CPF completo por extenso. Aplicado
// sempre, em toda tela (lista e ficha) — não existe hoje um nível de
// permissão que libere o CPF completo (ver [[canViewSensitiveField]] em
// sensitiveFields.ts, que cobre DADOS_BANCARIOS/MEDICOS/SALARIO/DOCUMENTOS,
// não CPF).
export function maskCpf(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}
