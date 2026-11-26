// Guias da folha (26/11/2026, funcionalidade-744): a conferência do que a
// competência apurou com as guias do mês — o DARF da DCTFWeb (baixado pela
// rotina do Serpro, funcionalidade-734) e a GFD do FGTS Digital (que não tem
// API: o DP anexa o PDF e informa o valor). "Processos › Apuração de Tributos
// federais" e "Relatórios › Guias" da Domínio.
//
// - DARF da DCTFWeb = contribuição previdenciária (INSS a recolher, já com
//   terceiros e as deduções) + IRRF a recolher. O PIS sobre a folha sai em
//   DARF à parte (código 8301), fora da DCTFWeb.
// - GFD = FGTS do mês (soma do FGTS de cada pessoa no cálculo).
//
// Puro, sem banco.

import { lerNumero } from "./entrada";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type SituacaoDaGuiaDaFolha = "SEM_GUIA" | "BATE" | "DIFERE";
export const NOME_DA_SITUACAO_DA_GUIA: Record<SituacaoDaGuiaDaFolha, string> = { SEM_GUIA: "Sem guia", BATE: "Bate com a apuração", DIFERE: "Difere da apuração" };

export type LinhaDasGuias = { guia: "DCTFWEB" | "FGTS"; nome: string; esperado: number; valorDaGuia: number | null; diferenca: number | null; situacao: SituacaoDaGuiaDaFolha; memoria: string };

/** Diferença acima de 1 centavo conta como divergência. */
const TOLERANCIA = 0.01;

function linha(guia: LinhaDasGuias["guia"], nome: string, esperado: number, valorDaGuia: number | null, memoria: string): LinhaDasGuias {
  if (valorDaGuia === null) return { guia, nome, esperado: r2(esperado), valorDaGuia: null, diferenca: null, situacao: "SEM_GUIA", memoria };
  const diferenca = r2(valorDaGuia - esperado);
  return { guia, nome, esperado: r2(esperado), valorDaGuia: r2(valorDaGuia), diferenca, situacao: Math.abs(diferenca) > TOLERANCIA ? "DIFERE" : "BATE", memoria };
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (n: number) => REAIS.format(n);

/**
 * Compara as guias com o apurado. `valorDarf` e `valorGfd` são os valores das
 * guias do mês (nulos quando não há guia). Diferença = guia − apuração.
 */
export function conferirGuias(e: { inssARecolher: number; irrfARecolher: number; fgtsDoMes: number; valorDarf: number | null; valorGfd: number | null }): LinhaDasGuias[] {
  const darf = r2(e.inssARecolher + e.irrfARecolher);
  return [
    linha("DCTFWEB", "DARF da DCTFWeb", darf, e.valorDarf, `INSS a recolher ${reais(e.inssARecolher)} + IRRF a recolher ${reais(e.irrfARecolher)} = ${reais(darf)}`),
    linha("FGTS", "GFD do FGTS Digital", e.fgtsDoMes, e.valorGfd, `FGTS do mês no cálculo: ${reais(r2(e.fgtsDoMes))}`),
  ];
}

/** Confere o que o DP informa ao anexar a GFD: valor e vencimento (AAAA-MM-DD). */
export function lerGuiaDoFgts(valor: string, vencimento: string): { ok: true; valor: number; vencimento: string } | { ok: false; erro: string } {
  const v = lerNumero(valor);
  if (v === null || !Number.isFinite(v) || v <= 0) return { ok: false, erro: "Informe o valor total da GFD." };
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(vencimento.trim())) return { ok: false, erro: "Informe o vencimento da GFD." };
  return { ok: true, valor: r2(v), vencimento: vencimento.trim() };
}
