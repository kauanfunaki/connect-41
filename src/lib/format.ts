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

// As opções que escolhem o que aparece. Se a chamada não passa nenhuma, o
// padrão é dia e hora sem segundos.
const PARTES_DA_DATA: (keyof Intl.DateTimeFormatOptions)[] = [
  "dateStyle", "timeStyle", "weekday", "era", "year", "month", "day",
  "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits", "timeZoneName",
];

/**
 * Dia e hora de um instante, para gente ler: "03/10/2026, 09:00".
 *
 * Sem opções, sem os segundos (07/10/2026). O padrão do `toLocaleString` é
 * "03/10/2026, 09:00:00", e as 37 chamadas sem opções — conversa da pendência,
 * documentos do processo, solicitações, comunicados, cartão do Kanban — saíam
 * com os segundos. Quem precisar deles (prova de assinatura, auditoria) passa
 * as opções, ou usa `formatInstantDateTimeComSegundos`.
 */
export function formatInstantDateTime(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const escolheu = PARTES_DA_DATA.some((k) => opts[k] !== undefined);
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(escolheu ? {} : { dateStyle: "short", timeStyle: "short" }),
    ...opts,
  });
}

/** Com os segundos — "03/10/2026, 09:00:05": registro de assinatura, de acesso, de auditoria. */
export function formatInstantDateTimeComSegundos(date: Date): string {
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });
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

export function formatCpf(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Formata pelo tipo do cadastro, sem o chamador precisar escolher a função. */
export function formatDocumento(
  kind: "PESSOA_JURIDICA" | "PESSOA_FISICA",
  cnpj: string | null | undefined,
  cpf: string | null | undefined
): string {
  return kind === "PESSOA_FISICA" ? formatCpf(cpf) : formatCnpj(cnpj);
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

// ─── Dinheiro, número e competência (07/10/2026) ────────────────────────────
//
// Um formato só para o app inteiro. Até aqui cada tela tinha o seu: 17
// `new Intl.NumberFormat("pt-BR", { style: "currency"… })` soltos, e o DP
// escrevia `R$ ${valor.toString()}`, que sai "R$ 3500.5" (sem milhar, com
// ponto). As telas passam a estes aos poucos; os locais (`moeda` do
// financeiro, `brl` do Valora, `rotuloDaCompetencia`…) seguem até lá.

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DECIMAIS = [0, 1, 2].map((casas) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }));

function numeroValido(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Reais: "R$ 1.234,56" — o formato do `Intl` em pt-BR, sempre com centavos, o
 * que o app mais usa. Vazio (ou um valor que não dá para calcular) vira "—":
 * "não sabemos" não é R$ 0,00.
 */
export function formatarReais(reais: number | null | undefined): string {
  return numeroValido(reais) ? REAIS.format(reais) : "—";
}

/** O mesmo, para o valor guardado em centavos (lançamentos, contas, taxas). */
export function formatarReaisDeCentavos(centavos: number | null | undefined): string {
  return numeroValido(centavos) ? REAIS.format(centavos / 100) : "—";
}

/** Número em pt-BR com até `casas` decimais (0 a 2): "8,25", "1.234". */
export function formatarNumero(v: number, casas: 0 | 1 | 2 = 1): string {
  return DECIMAIS[casas].format(v);
}

/** Horas com uma casa e espaço antes do "h": "3,5 h" — como Gestão e Valora. */
export function formatarHoras(horas: number): string {
  return `${formatarNumero(horas, 1)} h`;
}

const MESES_DA_COMPETENCIA = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * A competência para a interface: "2026-10" → "Out/26".
 *
 * Por que este formato: é o do `rotuloDaCompetencia` (lib/financeiro/periodo),
 * o mais usado do app — 23 chamadas, em DRE, fluxo de caixa, análises e
 * relatórios do portal —, contra 8 de "out/2026" (`competenciaLegivel`, fiscal)
 * e 4 de "10/2026" (`competenciaNaTela`, contas). Curto, cabe em coluna e em
 * filtro. O que não for "AAAA-MM" volta como veio, em vez de virar "—".
 */
export function formatarCompetencia(competencia: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(competencia);
  if (!m) return competencia;
  return `${MESES_DA_COMPETENCIA[Number(m[2]) - 1]}/${m[1].slice(2)}`;
}
