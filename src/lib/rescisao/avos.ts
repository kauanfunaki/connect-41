// Aritmética de datas do cálculo de rescisão. É onde mora a maior densidade de
// bug do motor, por isso vive isolada e é 100% pura/testável.
//
// Todas as datas são tratadas em UTC — o resto do app já grava data-calendário
// como meia-noite UTC (ver comentários em Document.expiresAt / Dependente).

import { AVISO_DIAS_BASE, AVISO_DIAS_POR_ANO, AVISO_DIAS_MAX, DIAS_MINIMOS_PARA_AVO } from "./constantes";

const DAY_MS = 24 * 60 * 60 * 1000;

export function utcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, dias: number): Date {
  const r = utcDate(d);
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

export function diasEntre(inicio: Date, fim: Date): number {
  return Math.round((utcDate(fim).getTime() - utcDate(inicio).getTime()) / DAY_MS);
}

/** Último dia do mês de `d` (lida com bissexto sozinho). */
export function ultimoDiaDoMes(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

// ─── Aviso prévio ────────────────────────────────────────────────────────────

/**
 * Aviso prévio proporcional: 30 dias + 3 por ano COMPLETO de serviço, teto 90.
 * A proporcionalidade é unilateral, em favor do empregado (Lei 12.506/2011).
 */
export function diasDeAvisoPrevio(admissao: Date, desligamento: Date): number {
  const anosCompletos = anosCompletosDeServico(admissao, desligamento);
  return Math.min(AVISO_DIAS_BASE + anosCompletos * AVISO_DIAS_POR_ANO, AVISO_DIAS_MAX);
}

export function anosCompletosDeServico(admissao: Date, desligamento: Date): number {
  const a = utcDate(admissao);
  const d = utcDate(desligamento);
  let anos = d.getUTCFullYear() - a.getUTCFullYear();
  const aniversarioDoAno = new Date(Date.UTC(d.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  if (d < aniversarioDoAno) anos -= 1;
  return Math.max(0, anos);
}

/**
 * Data projetada pelo aviso indenizado. O período projetado INTEGRA o tempo de
 * serviço para efeito de avos de 13º e férias proporcionais (CLT art. 487 §1º,
 * OJ 82 SDI-1) — mas NÃO para o saldo de salário, que para no último dia
 * trabalhado. Essa distinção é a fonte de erro mais comum da rescisão.
 */
export function dataProjetada(desligamento: Date, diasAviso: number): Date {
  return addDays(desligamento, diasAviso);
}

// ─── Avos ────────────────────────────────────────────────────────────────────

/**
 * Conta avos (n/12) entre duas datas, contando 1 avo por mês com pelo menos
 * `DIAS_MINIMOS_PARA_AVO` dias dentro do intervalo.
 *
 * `inicio` e `fim` são inclusivos.
 */
export function contarAvos(inicio: Date, fim: Date): number {
  const ini = utcDate(inicio);
  const f = utcDate(fim);
  if (f < ini) return 0;

  let avos = 0;
  // Percorre mês a mês do calendário, medindo a interseção com o intervalo.
  const cursor = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), 1));

  while (cursor <= f) {
    const primeiroDoMes = new Date(cursor);
    const ultimoDoMes = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), ultimoDiaDoMes(cursor)));

    const inicioEfetivo = primeiroDoMes < ini ? ini : primeiroDoMes;
    const fimEfetivo = ultimoDoMes > f ? f : ultimoDoMes;

    // +1 porque ambos os extremos contam (dia 1 a 15 = 15 dias).
    const diasNoMes = diasEntre(inicioEfetivo, fimEfetivo) + 1;
    if (diasNoMes >= DIAS_MINIMOS_PARA_AVO) avos++;

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return avos;
}

/**
 * Avos de 13º — ancorados no ANO CIVIL do `fim` (Lei 4.090/62). Com aviso
 * indenizado projetando pro ano seguinte, a projeção gera avo do ano NOVO, não
 * do ano da dispensa: por isso a contagem parte de 1º de janeiro do ano de
 * `fim`, e não da admissão.
 */
export function avosDecimoTerceiro(admissao: Date, fim: Date): number {
  const inicioDoAno = new Date(Date.UTC(fim.getUTCFullYear(), 0, 1));
  const inicio = utcDate(admissao) > inicioDoAno ? utcDate(admissao) : inicioDoAno;
  return Math.min(12, contarAvos(inicio, fim));
}

/**
 * Avos de férias proporcionais — ancorados no PERÍODO AQUISITIVO em curso
 * (CLT art. 146 § único), não no ano civil. Ancoragem diferente do 13º de
 * propósito: para a mesma pessoa as duas contagens podem divergir.
 */
export function avosFeriasProporcionais(inicioPeriodoAquisitivo: Date, fim: Date): number {
  return Math.min(12, contarAvos(inicioPeriodoAquisitivo, fim));
}

/** Dias trabalhados no mês do desligamento — base do saldo de salário. */
export function diasTrabalhadosNoMes(desligamento: Date, admissao: Date): number {
  const d = utcDate(desligamento);
  const a = utcDate(admissao);
  const primeiroDoMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  // Admitido no próprio mês do desligamento: conta da admissão.
  const inicio = a > primeiroDoMes ? a : primeiroDoMes;
  return diasEntre(inicio, d) + 1;
}
