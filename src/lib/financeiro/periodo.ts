// Competências e datas de calendário do financeiro. Funções puras.
//
// ─── Por que "AAAA-MM" e "AAAA-MM-DD" em texto ───────────────────────────────
//
// `FinanceEntry.competence` já é texto "AAAA-MM", e o vencimento é comparado
// pelo `dateKey` de São Paulo desde a tela de contas. Trafegar tudo como chave
// de calendário mantém a regra "vencida" igual em todas as telas novas — e
// comparação de texto não tem fuso para errar.

import { saoPauloParts } from "@/lib/agenda";

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const RE_COMPETENCIA = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "AAAA-MM" válida, ou `null`. */
export function competenciaValida(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  return RE_COMPETENCIA.test(t) ? t : null;
}

/** "AAAA-MM-DD" que existe no calendário, ou `null`. 31/02 não passa. */
export function dataValida(texto: string | null | undefined): string | null {
  const m = RE_DATA.exec((texto ?? "").trim());
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function partesDaCompetencia(comp: string): { ano: number; mes: number } {
  const [a, m] = comp.split("-");
  return { ano: Number(a), mes: Number(m) };
}

export function competenciaDe(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** Soma meses a uma competência. Negativo volta. */
export function somarMeses(comp: string, n: number): string {
  const { ano, mes } = partesDaCompetencia(comp);
  const total = ano * 12 + (mes - 1) + n;
  return competenciaDe(Math.floor(total / 12), (total % 12) + 1);
}

/** As `n` competências que terminam em `comp`, da mais antiga para a mais nova. */
export function competenciasAte(comp: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => somarMeses(comp, i - (n - 1)));
}

/** Janeiro até `comp`, no mesmo ano — o "acumulado do ano". */
export function acumuladoDoAno(comp: string): string[] {
  const { mes } = partesDaCompetencia(comp);
  return competenciasAte(comp, mes);
}

export function rotuloDaCompetencia(comp: string): string {
  const { ano, mes } = partesDaCompetencia(comp);
  return `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}`;
}

export function diasNoMes(comp: string): number {
  const { ano, mes } = partesDaCompetencia(comp);
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Dias de `de` até `ate`, em calendário. Positivo quando `ate` é depois. */
export function diasEntre(de: string, ate: string): number {
  const a = partesDaData(de);
  const b = partesDaData(ate);
  return Math.round((Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / 86_400_000);
}

function partesDaData(key: string): { ano: number; mes: number; dia: number } {
  const [a, m, d] = key.split("-");
  return { ano: Number(a), mes: Number(m), dia: Number(d) };
}

/**
 * Primeiro instante de uma competência em São Paulo, como Date UTC.
 *
 * O mesmo cálculo de `inicioDoMes` em `src/lib/dre/data.ts`, repetido aqui
 * porque aquele arquivo importa o Prisma e esta função precisa rodar em teste.
 */
export function inicioDaCompetencia(comp: string): Date {
  const { ano, mes } = partesDaCompetencia(comp);
  return new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
}

/** Competência de caixa de um instante — o mês em São Paulo em que ele caiu. */
export function competenciaDoInstante(d: Date): string {
  const p = saoPauloParts(d);
  return competenciaDe(p.year, p.month);
}

/**
 * Data de calendário gravada como instante: meio-dia em São Paulo.
 *
 * Meio-dia pelo mesmo motivo da baixa em `acoes.ts` — a data não escorrega de
 * dia ao atravessar o fuso, para nenhum dos dois lados.
 */
export function instanteDaData(key: string): Date {
  return new Date(`${key}T12:00:00-03:00`);
}
