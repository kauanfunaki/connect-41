// Porte de `extrato/periodo.py` (Fase 4, 10/11/2026): de que período é o extrato, lido do próprio
// documento e não do relógio. Vários bancos imprimem só dia e mês na linha ("03/02 Aquisição"), e
// completar com o ano do dia da importação jogava um extrato de 2025 inteiro em 2026.
//
// Em ordem de confiança: um intervalo explícito ("Período: 01/02/2025 a 28/02/2025"), mês e ano por
// extenso ("fev 2025"), a data do saldo final ("saldo em 31/01/25"). Linha de emissão fica de fora.

import { dataIso, diasEntre, diasNoMes, anoDe, mesDe, diaDe, type Transacao } from "./comum";
import { inteiro, re } from "./py";

const EMISSAO = re("emiti|emiss[aã]o|gerad[oa]\\s+em|impress|consulta\\s+realizada|data/hora", "i");
const DATA = "(\\d{2})/(\\d{2})/(\\d{4}|\\d{2})\\b";
const INTERVALO = re(`${DATA}\\s*(?:a|at[eé]|à|-|–)\\s*${DATA}`, "i");
const MESES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const MES_ANO = re("\\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\\.?(?:\\s+de)?\\s+(20\\d{2})\\b", "i");
const SALDO_EM = re(`saldo\\s+em\\s+${DATA}`, "i");
/** Só o topo do documento: é onde o período é declarado. */
const LINHAS_DO_CABECALHO = 80;

function data(d: string, m: string, a: string): string | null {
  const ano = a.length === 2 ? inteiro(a) + 2000 : inteiro(a);
  return dataIso(ano, inteiro(m), inteiro(d));
}

/** `fim_do_periodo`: a última data do período, ou `null` se o documento não disser. */
export function fimDoPeriodo(linhas: readonly string[]): string | null {
  const topo = linhas.slice(0, LINHAS_DO_CABECALHO).filter((l) => !EMISSAO.search(l));
  for (const linha of topo) {
    const m = INTERVALO.search(linha);
    if (m) {
      const fim = data(m[4]!, m[5]!, m[6]!);
      if (fim) return fim;
    }
  }
  for (const linha of topo) {
    const m = MES_ANO.search(linha);
    if (m) {
      const mes = MESES[m[1]!.toLowerCase().slice(0, 3)];
      const ano = inteiro(m[2]!);
      return dataIso(ano, mes, diasNoMes(ano, mes));
    }
  }
  const saldos: string[] = [];
  for (const linha of topo) {
    for (const m of SALDO_EM.finditer(linha)) {
      const d = data(m[1]!, m[2]!, m[3]!);
      if (d) saldos.push(d);
    }
  }
  return saldos.length ? saldos.reduce((a, b) => (b > a ? b : a)) : null;
}

/** Mais longe que isso depois do fim do período não é lançamento futuro: é o ano errado. */
const FUTURO_PLAUSIVEL_DIAS = 120;

/** `ajustar_virada_de_ano`: devolve ao ano anterior o lançamento que caiu longe demais no futuro. */
export function ajustarViradaDeAno(transacoes: readonly Transacao[], fim: string | null): Transacao[] {
  if (fim === null) return [...transacoes];
  return transacoes.map((t) => {
    // `t.data - fim > timedelta(days=120)`: compara dias inteiros.
    if (diasEntre(fim, t.data) <= FUTURO_PLAUSIVEL_DIAS) return t;
    const ano = anoDe(t.data) - 1;
    // 29/02 num ano que não tem vira 28/02.
    const nova = dataIso(ano, mesDe(t.data), diaDe(t.data)) ?? dataIso(ano, 2, 28)!;
    return { ...t, data: nova };
  });
}
