// Adiantamento salarial (vale) do DP 2 (26/11/2026, funcionalidade-758,
// entrega 1).
//
// A empresa que paga o vale no meio do mês configura o percentual (40% é o
// comum) e o dia. Na competência, o DP lança de uma vez o adiantamento de cada
// empregado (CLT) com contrato: o percentual sobre o salário do mês, na
// rubrica ADIANTAMENTO, que o cálculo já desconta na folha.
//
// Fica de fora quem foi admitido depois do dia do vale, quem já tem
// adiantamento lançado no mês e quem está desligado.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";

export type ParametrosDoAdiantamento = { percentual: number; dia: number };

export type PessoaDoAdiantamento = {
  personId: string;
  nome: string;
  salarioMensal: number;
  /** "AAAA-MM-DD". */
  admissao: string | null;
  desligamento: string | null;
  jaTemAdiantamento: boolean;
};

export type LinhaDoAdiantamento = { personId: string; nome: string; valor: number; fora: string | null };

export function lerParametrosDoAdiantamento(percentual: string, dia: string): { ok: true; parametros: ParametrosDoAdiantamento | null } | { ok: false; erro: string } {
  const p = Number(percentual.replace(",", ".").trim() || "0");
  const d = Number(dia.trim() || "0");
  if (!p && !d) return { ok: true, parametros: null };
  if (!Number.isFinite(p) || p <= 0 || p > 60) return { ok: false, erro: "O percentual do adiantamento vai de 1% a 60% do salário." };
  if (!Number.isInteger(d) || d < 1 || d > 28) return { ok: false, erro: "O dia do adiantamento vai de 1 a 28." };
  return { ok: true, parametros: { percentual: p, dia: d } };
}

/** O adiantamento de cada pessoa no mês `ano`/`mes`, com o motivo de quem fica de fora. */
export function adiantamentoDoMes(pessoas: readonly PessoaDoAdiantamento[], p: ParametrosDoAdiantamento, ano: number, mes: number): LinhaDoAdiantamento[] {
  const diaDoVale = `${ano}-${String(mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
  return pessoas
    .map((x) => {
      let fora: string | null = null;
      if (x.desligamento && x.desligamento <= diaDoVale) fora = "desligado";
      else if (x.admissao && x.admissao > diaDoVale) fora = `admitido depois do dia ${p.dia}`;
      else if (x.jaTemAdiantamento) fora = "já tem adiantamento lançado no mês";
      else if (x.salarioMensal <= 0) fora = "sem salário no contrato";
      return { personId: x.personId, nome: x.nome, valor: fora ? 0 : r2((x.salarioMensal * p.percentual) / 100), fora };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
