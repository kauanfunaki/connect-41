// Transparência salarial (25/11/2026, funcionalidade-775, entrega 1).
//
// A Lei 14.611/2023 (igualdade salarial entre mulheres e homens) obriga a
// empresa com 100 ou mais empregados a publicar, a cada semestre, o relatório
// de transparência salarial; o Ministério do Trabalho monta o relatório com o
// eSocial e a empresa responde o questionário no Emprega Brasil. O DP 2
// adianta a conferência: por cargo, quantas mulheres e quantos homens, a média
// do salário contratual de cada grupo e a razão entre elas, mais a mesma
// quebra por raça/cor (Tabela do eSocial).
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";

export const LIMITE_DA_LEI = 100;

export type PessoaDoRelatorio = { cargo: string | null; sexo: string | null; racaCor: string | null; salarioMensal: number };

export type LinhaPorCargo = {
  cargo: string;
  mulheres: number;
  homens: number;
  mediaMulheres: number | null;
  mediaHomens: number | null;
  /** Média das mulheres ÷ média dos homens, em %; nula quando falta um dos grupos. */
  razao: number | null;
};

export type LinhaPorRaca = { racaCor: string; pessoas: number; media: number };

export type RelatorioDeTransparencia = {
  empregados: number;
  obrigada: boolean;
  semSexo: number;
  porCargo: LinhaPorCargo[];
  porRaca: LinhaPorRaca[];
  geral: { mediaMulheres: number | null; mediaHomens: number | null; razao: number | null };
};

const media = (v: readonly number[]) => (v.length ? r2(v.reduce((s, x) => s + x, 0) / v.length) : null);
const razao = (m: number | null, h: number | null) => (m !== null && h !== null && h > 0 ? r2((m / h) * 100) : null);

/** Salário mensal do contrato: o horista vira mês pelas horas mensais. */
export function salarioMensalDoContrato(v: { salarioBase: number; tipoSalario: string; horasMensais: number }): number {
  return r2(v.tipoSalario === "HORISTA" ? v.salarioBase * v.horasMensais : v.salarioBase);
}

export function relatorioDeTransparencia(pessoas: readonly PessoaDoRelatorio[], nomeDaRaca: (codigo: string) => string = (c) => c): RelatorioDeTransparencia {
  const porCargo = new Map<string, { m: number[]; h: number[] }>();
  const porRaca = new Map<string, number[]>();
  let semSexo = 0;
  for (const p of pessoas) {
    if (p.sexo !== "F" && p.sexo !== "M") semSexo += 1;
    const cargo = p.cargo?.trim() || "Sem cargo no cadastro";
    const g = porCargo.get(cargo) ?? { m: [], h: [] };
    if (p.sexo === "F") g.m.push(p.salarioMensal);
    if (p.sexo === "M") g.h.push(p.salarioMensal);
    porCargo.set(cargo, g);
    const raca = p.racaCor ? nomeDaRaca(p.racaCor) : "Não informada";
    porRaca.set(raca, [...(porRaca.get(raca) ?? []), p.salarioMensal]);
  }
  const todasM = pessoas.filter((p) => p.sexo === "F").map((p) => p.salarioMensal);
  const todosH = pessoas.filter((p) => p.sexo === "M").map((p) => p.salarioMensal);
  return {
    empregados: pessoas.length,
    obrigada: pessoas.length >= LIMITE_DA_LEI,
    semSexo,
    porCargo: [...porCargo.entries()]
      .map(([cargo, g]) => {
        const mediaMulheres = media(g.m);
        const mediaHomens = media(g.h);
        return { cargo, mulheres: g.m.length, homens: g.h.length, mediaMulheres, mediaHomens, razao: razao(mediaMulheres, mediaHomens) };
      })
      .filter((l) => l.mulheres + l.homens > 0)
      .sort((a, b) => a.cargo.localeCompare(b.cargo, "pt-BR")),
    porRaca: [...porRaca.entries()].map(([racaCor, v]) => ({ racaCor, pessoas: v.length, media: media(v)! })).sort((a, b) => b.pessoas - a.pessoas || a.racaCor.localeCompare(b.racaCor, "pt-BR")),
    geral: { mediaMulheres: media(todasM), mediaHomens: media(todosH), razao: razao(media(todasM), media(todosH)) },
  };
}
