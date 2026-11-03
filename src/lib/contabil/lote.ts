// O lote do ano (03/11/2026): porte do passo 7 do painel contábil do motor
// (`contabil.py`, `lote_zip`). Os doze meses de uma empresa num ZIP, com um
// arquivo da Domínio por mês e por passo que gera lançamento e um resumo do
// que saiu, do que ficou pendente e do que não tinha nada. Puro: quem chama
// traz as linhas de cada mês.
//
// O que muda do motor: lá o lote levava só as entradas; aqui leva também as
// saídas, e os pagamentos sem nota quando o passo 5 existir.

import type { LinhaDaDominio } from "@/lib/financeiro/dominio/planilha";

export type PassoDoLote = "nfe" | "cte" | "nfse" | "saidas" | "pagamentos";
export const ROTULO_DO_PASSO: Record<PassoDoLote, string> = {
  nfe: "Entradas NF-e", cte: "Entradas CT-e", nfse: "Entradas NFS-e", saidas: "Saídas", pagamentos: "Pagamentos sem nota",
};

/** O que um passo deu num mês: as linhas, as pendências que ficaram de fora, ou o erro. */
export type ResultadoDoPasso = { passo: PassoDoLote; linhas: LinhaDaDominio[]; pendencias: number; erro?: string };
export type MesDoLote = { competencia: string; passos: ResultadoDoPasso[] };

/** As doze competências de um ano, "AAAA-01" a "AAAA-12". */
export function competenciasDoAno(ano: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
}

/** O nome do arquivo de um passo no mês: o mesmo da exportação avulsa, para o Contábil reconhecer. */
export function nomeNoLote(passo: PassoDoLote, cnpj: string, competencia: string, formato: "xlsx" | "txt"): string {
  return `${competencia}/lancamentos_${passo}_${cnpj || "empresa"}_${competencia}.${formato}`;
}

export function situacaoDoPasso(r: ResultadoDoPasso): string {
  if (r.erro) return "ERRO";
  if (!r.linhas.length) return r.pendencias ? "só pendências" : "sem lançamentos";
  return r.pendencias ? "gerado com pendências" : "gerado";
}

/** O resumo do lote, em CSV com ";" como os do motor: uma linha por mês e por passo. */
export function resumoDoLote(meses: readonly MesDoLote[]): string {
  const linhas = ["competencia;passo;situacao;lancamentos;pendencias;detalhe"];
  for (const m of meses) for (const r of m.passos) {
    const detalhe = (r.erro ?? "").replace(/[;\r\n]/g, " ");
    linhas.push([m.competencia, ROTULO_DO_PASSO[r.passo], situacaoDoPasso(r), r.linhas.length, r.pendencias, detalhe].join(";"));
  }
  return linhas.join("\r\n") + "\r\n";
}
