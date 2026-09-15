// Fluxo de caixa — realizado e projeção — e o consolidado por empresa.
// Funções puras.
//
// ─── Realizado é caixa, projeção é título ────────────────────────────────────
//
// O realizado olha `paidAt`: dinheiro que andou, no mês em que andou. A
// projeção olha o que **ainda não andou** — título em aberto, pelo vencimento.
// Não há saldo bancário no Connect (conciliação é outra etapa), então a
// projeção é o líquido dos títulos, e a tela diz isso em vez de inventar um
// saldo inicial.

import { diasEntre, rotuloDaCompetencia } from "./periodo";

export type MovimentoRealizado = {
  /** Mês em São Paulo em que o dinheiro andou. */
  competenciaDeCaixa: string;
  kind: "PAGAR" | "RECEBER";
  centavos: number;
};

export type MesDoFluxo = {
  competencia: string;
  rotulo: string;
  entradas: number;
  /** Positivo — é o valor que saiu. */
  saidas: number;
  saldoDoMes: number;
  /** Acumulado desde o primeiro mês da janela, não desde sempre. */
  saldoAcumulado: number;
};

/** Entradas e saídas por mês, na ordem das competências pedidas. */
export function fluxoRealizado(movimentos: MovimentoRealizado[], competencias: string[]): MesDoFluxo[] {
  const porMes = new Map(competencias.map((c) => [c, { entradas: 0, saidas: 0 }]));
  for (const m of movimentos) {
    const mes = porMes.get(m.competenciaDeCaixa);
    // Movimento fora da janela é ignorado, não somado no mês mais próximo.
    if (!mes) continue;
    if (m.kind === "RECEBER") mes.entradas += m.centavos;
    else mes.saidas += m.centavos;
  }
  let acumulado = 0;
  return competencias.map((competencia) => {
    const { entradas, saidas } = porMes.get(competencia)!;
    const saldoDoMes = entradas - saidas;
    acumulado += saldoDoMes;
    return { competencia, rotulo: rotuloDaCompetencia(competencia), entradas, saidas, saldoDoMes, saldoAcumulado: acumulado };
  });
}

export type TituloEmAberto = {
  kind: "PAGAR" | "RECEBER";
  centavos: number;
  vencimentoKey: string;
};

export const JANELAS_DA_PROJECAO = [7, 15, 30, 60, 90, 180] as const;

export type JanelaDaProjecao = {
  dias: number;
  entradas: number;
  saidas: number;
  /** Entradas − saídas vencendo de hoje até o fim da janela. */
  saldo: number;
};

export type Projecao = {
  /** O que já venceu e não foi baixado — fora das janelas, mostrado à parte. */
  vencidos: { entradas: number; saidas: number };
  janelas: JanelaDaProjecao[];
};

/**
 * O que vence em cada janela, **acumulado** a partir de hoje.
 *
 * O vencido fica fora das janelas de propósito. Somá-lo na janela de 7 dias
 * diria que o dinheiro atrasado há três meses entra esta semana — que é o
 * otimismo que um fluxo de caixa não pode ter.
 */
export function projecaoPorJanela(
  titulos: TituloEmAberto[],
  hojeKey: string,
  janelas: readonly number[] = JANELAS_DA_PROJECAO
): Projecao {
  const vencidos = { entradas: 0, saidas: 0 };
  const saida = janelas.map((dias) => ({ dias, entradas: 0, saidas: 0, saldo: 0 }));
  for (const t of titulos) {
    const dias = diasEntre(hojeKey, t.vencimentoKey);
    if (dias < 0) {
      if (t.kind === "RECEBER") vencidos.entradas += t.centavos;
      else vencidos.saidas += t.centavos;
      continue;
    }
    for (const j of saida) {
      if (dias > j.dias) continue;
      if (t.kind === "RECEBER") j.entradas += t.centavos;
      else j.saidas += t.centavos;
    }
  }
  for (const j of saida) j.saldo = j.entradas - j.saidas;
  return { vencidos, janelas: saida };
}

/** Títulos em aberto por mês de vencimento — a coluna de caixa do forecast. */
export function abertosPorMes(titulos: TituloEmAberto[], competencias: string[]): Map<string, number> {
  const m = new Map(competencias.map((c) => [c, 0]));
  for (const t of titulos) {
    const c = t.vencimentoKey.slice(0, 7);
    if (!m.has(c)) continue;
    m.set(c, m.get(c)! + (t.kind === "RECEBER" ? t.centavos : -t.centavos));
  }
  return m;
}

export type SomaPorEmpresa = { companyId: string; kind: "PAGAR" | "RECEBER"; centavos: number };
export type ContagemPorEmpresa = { companyId: string; kind: "PAGAR" | "RECEBER"; quantidade: number };

export type LinhaDoConsolidado = {
  companyId: string;
  pago: number;
  recebido: number;
  saldo: number;
  vencidasPagar: number;
  vencidasReceber: number;
};

/**
 * Uma linha por empresa que teve movimento no mês ou tem conta vencida.
 *
 * Empresa sem nada não aparece: com quase quatrocentas empresas no tenant, a
 * lista inteira de zeros esconderia as dez que pedem atenção. Ordena pelas
 * vencidas primeiro — é o que o relatório existe para mostrar.
 */
export function consolidarPorEmpresa(somas: SomaPorEmpresa[], vencidas: ContagemPorEmpresa[]): LinhaDoConsolidado[] {
  const linhas = new Map<string, LinhaDoConsolidado>();
  const linha = (companyId: string) => {
    let l = linhas.get(companyId);
    if (!l) {
      l = { companyId, pago: 0, recebido: 0, saldo: 0, vencidasPagar: 0, vencidasReceber: 0 };
      linhas.set(companyId, l);
    }
    return l;
  };
  for (const s of somas) {
    const l = linha(s.companyId);
    if (s.kind === "PAGAR") l.pago += s.centavos;
    else l.recebido += s.centavos;
  }
  for (const v of vencidas) {
    const l = linha(v.companyId);
    if (v.kind === "PAGAR") l.vencidasPagar += v.quantidade;
    else l.vencidasReceber += v.quantidade;
  }
  for (const l of linhas.values()) l.saldo = l.recebido - l.pago;
  return [...linhas.values()].sort(
    (a, b) =>
      b.vencidasPagar + b.vencidasReceber - (a.vencidasPagar + a.vencidasReceber) ||
      Math.abs(b.saldo) - Math.abs(a.saldo) ||
      a.companyId.localeCompare(b.companyId)
  );
}
