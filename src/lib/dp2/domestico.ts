// O DAE do Simples Doméstico (26/11/2026, funcionalidade-777, entrega 1).
//
// O empregador doméstico recolhe tudo numa guia só, o DAE, que o eSocial
// Doméstico emite com a folha fechada: o INSS do empregado (retido), o INSS
// patronal (8%), o GILRAT (0,8%), o FGTS (8%), a indenização compensatória
// (3,2%) e o IRRF, quando há. Aqui a conta vem do cálculo do DP 2, para
// conferir com a guia emitida.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";

export type CalculoDoDomestico = {
  nome: string;
  inss: number;
  irrf: number;
  fgts: number;
  encargos: { inssEmpresa: number; rat: number; indenizacaoCompensatoria?: number } | null;
};

export type LinhaDoDae = { rotulo: string; valor: number };

export function daeDoDomestico(calculos: readonly CalculoDoDomestico[]): { linhas: LinhaDoDae[]; total: number } {
  const soma = (f: (c: CalculoDoDomestico) => number) => r2(calculos.reduce((s, c) => s + f(c), 0));
  const linhas: LinhaDoDae[] = [
    { rotulo: "INSS do empregado (retido)", valor: soma((c) => c.inss) },
    { rotulo: "INSS patronal (8%)", valor: soma((c) => c.encargos?.inssEmpresa ?? 0) },
    { rotulo: "GILRAT (0,8%)", valor: soma((c) => c.encargos?.rat ?? 0) },
    { rotulo: "FGTS (8%)", valor: soma((c) => c.fgts) },
    { rotulo: "Indenização compensatória (3,2%)", valor: soma((c) => c.encargos?.indenizacaoCompensatoria ?? 0) },
    { rotulo: "IRRF", valor: soma((c) => c.irrf) },
  ];
  return { linhas, total: r2(linhas.reduce((s, l) => s + l.valor, 0)) };
}
