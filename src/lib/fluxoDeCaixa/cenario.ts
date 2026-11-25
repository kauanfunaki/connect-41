// O cenário do fluxo de caixa (26/11/2026, funcionalidade-838): o previsto mês
// a mês com as premissas da empresa — custos que ainda não são conta lançada,
// em valor fixo por mês ou em % das vendas do mês. É o "fluxo simulado" da
// planilha de um cliente do BPO: o previsto não muda, o cenário é uma conta à
// parte, somada a ele.
//
// "Vendas do mês" é o que entra pelas linhas de recebimento de clientes e de
// pedidos a faturar, a mesma base que a planilha usava.
//
// Puro.

import type { Periodo, Previsto } from "./projecao";

export type TipoDePremissa = "fixo" | "percentual";

export type Premissa = {
  nome: string;
  tipo: TipoDePremissa;
  /** Reais por mês ("fixo") ou percentual das vendas ("percentual": 5 = 5%). */
  valor: number;
};

/** As linhas que contam como vendas do mês, base das premissas em %. */
export const LINHAS_DAS_VENDAS = ["recebimentos", "pedidos"] as const;

export const ROTULO_DO_TIPO: Record<TipoDePremissa, string> = { fixo: "Fixo por mês", percentual: "% das vendas" };

export type Cenario = {
  periodos: Periodo[];
  vendas: number[];
  premissas: (Premissa & { valores: number[] })[];
  totalDasPremissas: number[];
  saldoPrevisto: number[];
  saldoComPremissas: number[];
  menorComPremissas: { centavos: number; periodo: Periodo } | null;
};

export function montarCenario(previsto: Previsto, premissas: Premissa[]): Cenario {
  const n = previsto.periodos.length;
  const vendas = new Array<number>(n).fill(0);
  for (const g of previsto.grupos) {
    for (const l of g.linhas) {
      if (!(LINHAS_DAS_VENDAS as readonly string[]).includes(l.code)) continue;
      l.valores.forEach((v, i) => (vendas[i]! += v));
    }
  }
  const comValores = premissas.map((p) => ({
    ...p,
    // Custo: sai do caixa, com o sinal de menos. Venda negativa não vira custo negativo.
    valores: vendas.map((v) => -(p.tipo === "fixo" ? Math.round(p.valor * 100) : Math.round((Math.max(v, 0) * p.valor) / 100))),
  }));
  const totalDasPremissas = vendas.map((_, i) => comValores.reduce((s, p) => s + p.valores[i]!, 0));
  let acumulado = 0;
  const saldoComPremissas = previsto.saldoFinal.map((s, i) => {
    acumulado += totalDasPremissas[i]!;
    return s + acumulado;
  });
  let menor: Cenario["menorComPremissas"] = null;
  saldoComPremissas.forEach((c, i) => {
    if (!menor || c < menor.centavos) menor = { centavos: c, periodo: previsto.periodos[i]! };
  });
  return {
    periodos: previsto.periodos,
    vendas,
    premissas: comValores,
    totalDasPremissas,
    saldoPrevisto: previsto.saldoFinal,
    saldoComPremissas,
    menorComPremissas: menor,
  };
}

/** Uma premissa válida para gravar, ou o motivo. */
export function premissaValida(p: { nome: string; tipo: string; valor: number }): { ok: true; premissa: Premissa } | { ok: false; erro: string } {
  const nome = p.nome.replace(/\s+/g, " ").trim();
  if (!nome || nome.length > 80) return { ok: false, erro: "Cada premissa precisa de um nome, com até 80 letras." };
  if (p.tipo !== "fixo" && p.tipo !== "percentual") return { ok: false, erro: `Tipo de premissa desconhecido em “${nome}”.` };
  if (!Number.isFinite(p.valor) || p.valor < 0) return { ok: false, erro: `O valor de “${nome}” precisa ser um número positivo.` };
  if (p.tipo === "percentual" && p.valor > 100) return { ok: false, erro: `“${nome}” passa de 100% das vendas.` };
  if (p.tipo === "fixo" && p.valor > 1_000_000_000) return { ok: false, erro: `O valor de “${nome}” é grande demais.` };
  return { ok: true, premissa: { nome, tipo: p.tipo, valor: p.valor } };
}
