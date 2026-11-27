// A lista de Lançamentos, paginada no servidor (27/11/2026, melhoria-571).
//
// Funções puras: os funis das colunas lidos da URL e o `where` de cada um. As
// consultas moram em `paginaDeLancamentosServidor.ts`.
//
// A lista ia até 500 lançamentos de uma empresa num mês (`LIMITE_DA_LISTA`),
// com o aviso "Mostrando os 500 primeiros". Agora traz uma página, e a
// contagem e os totais da barra somam o filtro inteiro, no banco.
//
// Os funis das colunas filtravam, no navegador, as linhas que a tela trouxe.
// Numa lista paginada isso engana — o fornecedor sumiria da página 1 e
// continuaria nas outras —, então foram para a URL, como em Contas a pagar e
// a receber (`paginaDeContas.ts`, 13/11/2026): vencimento, contraparte,
// categoria e centro usam o mesmo `where` de lá; tipo e situação, os daqui.

import type { Prisma } from "@/generated/prisma/client";
import { whereDoFunil as whereDoFunilDasContas } from "./paginaDeContas";

/** Lançamentos por página — o mesmo número de Contas a pagar e a receber. */
export const LANCAMENTOS_POR_PAGINA = 50;

/** O parâmetro de cada funil na URL, repetido por valor (`?tipo=PAGAR&tipo=RECEBER`). */
export const CHAVES_DOS_FUNIS_DO_LANCAMENTO = ["tipo", "contraparte", "categoria", "centro", "vencimento", "situacao"] as const;
export type ChaveDoFunilDoLancamento = (typeof CHAVES_DOS_FUNIS_DO_LANCAMENTO)[number];

export type FunisDosLancamentos = Partial<Record<ChaveDoFunilDoLancamento, string[]>>;

/** O tipo como a coluna mostra. */
export const TIPOS_DO_LANCAMENTO = [
  { valor: "PAGAR", rotulo: "A pagar" },
  { valor: "RECEBER", rotulo: "A receber" },
] as const;

/**
 * A situação como a coluna mostra: a do `status`, com renegociado e perda pelo
 * nome (o fechamento), como o selo da linha.
 */
export const SITUACOES_DO_LANCAMENTO = [
  { valor: "conferir", rotulo: "A conferir" },
  { valor: "aberto", rotulo: "Em aberto" },
  { valor: "pago", rotulo: "Pago" },
  { valor: "cancelado", rotulo: "Cancelado" },
  { valor: "renegociado", rotulo: "Renegociado" },
  { valor: "perda", rotulo: "Perda" },
] as const;
export type SituacaoDoLancamento = (typeof SITUACOES_DO_LANCAMENTO)[number]["valor"];

const STATUS_DA_SITUACAO = {
  conferir: "PROVISORIO",
  aberto: "CONFERIDO",
  pago: "PAGO",
  cancelado: "CANCELADO",
} as const;

/** A situação de um lançamento, na regra do selo da linha. */
export function situacaoDoLancamento(l: {
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  closeReason: "CANCELADO" | "RENEGOCIADO" | "PERDA" | null;
}): SituacaoDoLancamento {
  if (l.closeReason === "RENEGOCIADO") return "renegociado";
  if (l.closeReason === "PERDA") return "perda";
  switch (l.status) {
    case "PROVISORIO":
      return "conferir";
    case "CONFERIDO":
      return "aberto";
    case "PAGO":
      return "pago";
    case "CANCELADO":
      return "cancelado";
  }
}

/** Teto de valores por funil: protege a consulta de uma URL montada à mão. */
const VALORES_POR_FUNIL = 500;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS = new Set<string>(TIPOS_DO_LANCAMENTO.map((t) => t.valor));
const SITUACOES = new Set<string>(SITUACOES_DO_LANCAMENTO.map((s) => s.valor));

/** Os valores que valem para o funil: sem repetição, no formato dele, até o teto. */
function valoresValidos(chave: ChaveDoFunilDoLancamento, valores: string[]): string[] {
  const ok = valores
    .map((v) => v.trim())
    .filter((v) => {
      if (chave === "vencimento") return DATA.test(v);
      if (chave === "tipo") return TIPOS.has(v);
      if (chave === "situacao") return SITUACOES.has(v);
      // Um id, ou o vazio ("sem categoria"). Contraparte é obrigatória: vazio não casa nada.
      return v.length <= 64;
    });
  return [...new Set(ok)].slice(0, VALORES_POR_FUNIL);
}

/**
 * Os funis escolhidos, lidos dos parâmetros da URL (um valor ou vários).
 * Parâmetro presente e nada válido fica como lista vazia — o filtro não pode
 * virar "tudo".
 */
export function funisDosLancamentosDaUrl(params: Record<string, string | string[] | undefined>): FunisDosLancamentos {
  const funis: FunisDosLancamentos = {};
  for (const chave of CHAVES_DOS_FUNIS_DO_LANCAMENTO) {
    const bruto = params[chave];
    if (bruto === undefined) continue;
    funis[chave] = valoresValidos(chave, Array.isArray(bruto) ? bruto : [bruto]);
  }
  return funis;
}

/** Tem algum funil aplicado. */
export function temFunilNoLancamento(funis: FunisDosLancamentos): boolean {
  return CHAVES_DOS_FUNIS_DO_LANCAMENTO.some((c) => funis[c] !== undefined);
}

/** Os funis de volta em parâmetros de URL, para a paginação não os perder. */
export function funisDoLancamentoNaConsulta(funis: FunisDosLancamentos, q: URLSearchParams): void {
  for (const chave of CHAVES_DOS_FUNIS_DO_LANCAMENTO) {
    for (const v of funis[chave] ?? []) q.append(chave, v);
  }
}

/** O `where` de uma situação, com a regra de `situacaoDoLancamento`. */
export function whereDaSituacaoDoLancamento(situacao: SituacaoDoLancamento): Prisma.FinanceEntryWhereInput {
  if (situacao === "renegociado") return { closeReason: "RENEGOCIADO" };
  if (situacao === "perda") return { closeReason: "PERDA" };
  // Sem fechamento com nome: o vazio ou o cancelado comum.
  return { status: STATUS_DA_SITUACAO[situacao], OR: [{ closeReason: null }, { closeReason: "CANCELADO" }] };
}

/** O `where` de um funil. Sem valor válido, não casa nada. */
export function whereDoFunilDoLancamento(chave: ChaveDoFunilDoLancamento, valores: string[]): Prisma.FinanceEntryWhereInput {
  if (valores.length === 0) return { id: { in: [] } };
  switch (chave) {
    case "tipo":
      return { kind: { in: valores as ("PAGAR" | "RECEBER")[] } };
    case "situacao":
      return { OR: valores.map((s) => whereDaSituacaoDoLancamento(s as SituacaoDoLancamento)) };
    // A data de hoje só vale para a situação das contas, que aqui não se usa.
    default:
      return whereDoFunilDasContas(chave, valores, "");
  }
}

/**
 * Os funis como uma lista para o `AND` do `where`, cada um num item. `exceto`
 * deixa um de fora: é a cascata do Excel — o funil de uma coluna oferece os
 * valores dos lançamentos que passam pelos funis das outras.
 */
export function whereDosFunisDosLancamentos(funis: FunisDosLancamentos, exceto?: ChaveDoFunilDoLancamento): Prisma.FinanceEntryWhereInput[] {
  const lista: Prisma.FinanceEntryWhereInput[] = [];
  for (const chave of CHAVES_DOS_FUNIS_DO_LANCAMENTO) {
    const valores = funis[chave];
    if (valores === undefined || chave === exceto) continue;
    lista.push(whereDoFunilDoLancamento(chave, valores));
  }
  return lista;
}
