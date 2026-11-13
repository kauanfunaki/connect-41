// A lista de Contas a pagar e a receber, paginada no servidor (13/11/2026).
//
// Funções puras: a página da URL, os funis das colunas lidos da URL e o
// `where` de cada um. A consulta mora em `data.ts`; o funil, em
// `FiltroDaColunaNaUrl`.
//
// ─── Por que paginar ────────────────────────────────────────────────────────
//
// A lista ia até mil contas de uma vez (`LIMITE_DE_CONTAS`), e cada conta
// custava cerca de 4,3 KB de RSC — a linha da tabela e o cartão do celular, os
// dois desenhados no servidor. Perto de 4 MB por abertura ou filtro na
// produção (medição de 13/11/2026, `scripts/medir-payload-das-telas.mjs`).
// Agora a lista traz uma página, e os totais do topo continuam somando o
// filtro inteiro, no banco.
//
// ─── Por que os funis foram para a URL ──────────────────────────────────────
//
// O funil das colunas filtrava as linhas que a tela já tinha trazido, no
// navegador. Numa lista paginada isso engana: o fornecedor sumiria da página 1
// e continuaria nas outras (o mesmo motivo de Empresas, em
// `FiltroDaColunaNaUrl`). Agora a escolha vai para a URL, o `where` sai daqui e
// os valores de cada funil vêm do banco quando o funil abre — não a cada
// página, que é o que pesava.

import type { Prisma } from "@/generated/prisma/client";
import { addDaysToKey } from "@/lib/agenda";

/** Contas por página. Cabe numa tela de trabalho e deixa a página leve. */
export const CONTAS_POR_PAGINA = 50;

/** A página pedida na URL (`?pagina=3`); qualquer coisa estranha é a 1. */
export function paginaDaUrl(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const n = Number(texto);
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/** Quantas páginas cabem `total` contas — ao menos uma, para a lista vazia. */
export function totalDePaginas(total: number, porPagina: number = CONTAS_POR_PAGINA): number {
  return Math.max(1, Math.ceil(total / porPagina));
}

/**
 * Que pedaço de cada parte da lista entra na página.
 *
 * A lista pode ser feita de partes em sequência, cada uma com a ordem dela —
 * em "Todas", as em aberto (do vencimento mais antigo) e depois o histórico
 * (do mais recente). A página é uma janela sobre a sequência inteira: começa
 * em `(pagina - 1) * porPagina` e pode atravessar a divisa entre duas partes.
 * Devolve só as partes que contribuem, com o `skip` e o `take` de cada uma.
 */
export function fatiasDaPagina(
  contagens: number[],
  pagina: number,
  porPagina: number = CONTAS_POR_PAGINA
): { parte: number; skip: number; take: number }[] {
  let inicio = (Math.max(1, pagina) - 1) * porPagina;
  let falta = porPagina;
  const fatias: { parte: number; skip: number; take: number }[] = [];
  contagens.forEach((n, parte) => {
    if (falta <= 0) return;
    if (inicio >= n) {
      inicio -= n;
      return;
    }
    const take = Math.min(falta, n - inicio);
    fatias.push({ parte, skip: inicio, take });
    falta -= take;
    inicio = 0;
  });
  return fatias;
}

// ─── Funis das colunas ──────────────────────────────────────────────────────

/**
 * O parâmetro de cada funil na URL, repetido por valor (`?categoria=a&categoria=b`).
 * O vazio ("sem categoria", "sem centro") vai como valor em branco, como em
 * Empresas: aparece no funil como "(vazio)".
 */
export const CHAVES_DOS_FUNIS = ["vencimento", "contraparte", "categoria", "centro", "projeto", "situacao"] as const;
export type ChaveDoFunil = (typeof CHAVES_DOS_FUNIS)[number];

export type FunisDasContas = Partial<Record<ChaveDoFunil, string[]>>;

/** Teto de valores por funil: protege a consulta de uma URL montada à mão. */
const VALORES_POR_FUNIL = 500;

/** A situação como o funil oferece — a da coluna, com renegociada e perda pelo nome. */
export const SITUACOES_DO_FUNIL = [
  { valor: "vencida", rotulo: "Vencida" },
  { valor: "hoje", rotulo: "Vence hoje" },
  { valor: "avencer", rotulo: "A vencer" },
  { valor: "paga", rotulo: "Paga" },
  { valor: "cancelada", rotulo: "Cancelada" },
  { valor: "renegociada", rotulo: "Renegociada" },
  { valor: "perda", rotulo: "Perda" },
] as const;
export type SituacaoDoFunil = (typeof SITUACOES_DO_FUNIL)[number]["valor"];

export function ehChaveDoFunil(chave: string): chave is ChaveDoFunil {
  return (CHAVES_DOS_FUNIS as readonly string[]).includes(chave);
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const SITUACOES = new Set<string>(SITUACOES_DO_FUNIL.map((s) => s.valor));

/** Os valores que valem para o funil: sem repetição, no formato dele, até o teto. */
function valoresValidos(chave: ChaveDoFunil, valores: string[]): string[] {
  const ok = valores
    .map((v) => v.trim())
    .filter((v) => {
      if (chave === "vencimento") return DATA.test(v);
      if (chave === "situacao") return SITUACOES.has(v);
      // Um id, ou o vazio ("sem categoria"). Contraparte é obrigatória: vazio não casa nada.
      return v.length <= 64;
    });
  return [...new Set(ok)].slice(0, VALORES_POR_FUNIL);
}

/** Os funis escolhidos, lidos dos parâmetros da URL (um valor ou vários). */
export function funisDaUrl(params: Record<string, string | string[] | undefined>): FunisDasContas {
  const funis: FunisDasContas = {};
  for (const chave of CHAVES_DOS_FUNIS) {
    const bruto = params[chave];
    if (bruto === undefined) continue;
    const valores = valoresValidos(chave, Array.isArray(bruto) ? bruto : [bruto]);
    // Parâmetro presente e nada válido (valor velho, digitado à mão): o filtro
    // não pode virar "tudo" — fica a lista vazia, como em Empresas.
    funis[chave] = valores;
  }
  return funis;
}

/** Os funis de um `URLSearchParams` — o que a ação do funil recebe do navegador. */
export function funisDaConsulta(consulta: URLSearchParams): FunisDasContas {
  const params: Record<string, string[]> = {};
  for (const chave of CHAVES_DOS_FUNIS) {
    if (consulta.has(chave)) params[chave] = consulta.getAll(chave);
  }
  return funisDaUrl(params);
}

/** Tem algum funil aplicado. */
export function temFunil(funis: FunisDasContas): boolean {
  return CHAVES_DOS_FUNIS.some((c) => funis[c] !== undefined);
}

/** Os funis de volta em parâmetros de URL, para os links da tela não os perderem. */
export function funisNaConsulta(funis: FunisDasContas, q: URLSearchParams): void {
  for (const chave of CHAVES_DOS_FUNIS) {
    for (const v of funis[chave] ?? []) q.append(chave, v);
  }
}

/** Começo do dia em São Paulo (sem horário de verão desde 2019) — o corte de `situacaoDaConta`. */
function inicioDoDia(key: string): Date {
  return new Date(`${key}T00:00:00-03:00`);
}

const ABERTAS: Prisma.FinanceEntryWhereInput = { paidAt: null, status: { notIn: ["CANCELADO", "PAGO"] } };

/** O `where` de uma situação do funil, com as regras de `situacaoDaConta` e do rótulo da coluna. */
export function whereDaSituacao(situacao: SituacaoDoFunil, hojeKey: string): Prisma.FinanceEntryWhereInput {
  const hoje = inicioDoDia(hojeKey);
  const amanha = inicioDoDia(addDaysToKey(hojeKey, 1));
  switch (situacao) {
    case "vencida":
      return { ...ABERTAS, dueDate: { lt: hoje } };
    case "hoje":
      return { ...ABERTAS, dueDate: { gte: hoje, lt: amanha } };
    case "avencer":
      return { ...ABERTAS, dueDate: { gte: amanha } };
    case "paga":
      return { status: { not: "CANCELADO" }, OR: [{ status: "PAGO" }, { paidAt: { not: null } }] };
    case "cancelada":
      return { status: "CANCELADO", OR: [{ closeReason: null }, { closeReason: "CANCELADO" }] };
    case "renegociada":
      return { closeReason: "RENEGOCIADO" };
    case "perda":
      return { closeReason: "PERDA" };
  }
}

/** Um campo opcional por id: os ids escolhidos e, com o vazio entre eles, o "sem". */
function porIds(campo: "categoryId" | "costCenterId" | "projectId", valores: string[]): Prisma.FinanceEntryWhereInput {
  const ids = valores.filter((v) => v !== "");
  const semNenhum = valores.includes("");
  const alternativas: Prisma.FinanceEntryWhereInput[] = [
    ...(ids.length ? [{ [campo]: { in: ids } }] : []),
    ...(semNenhum ? [{ [campo]: null }] : []),
  ];
  return alternativas.length === 1 ? alternativas[0] : { OR: alternativas };
}

/** O `where` de um funil. Sem valor válido, não casa nada. */
export function whereDoFunil(chave: ChaveDoFunil, valores: string[], hojeKey: string): Prisma.FinanceEntryWhereInput {
  const NADA: Prisma.FinanceEntryWhereInput = { id: { in: [] } };
  if (valores.length === 0) return NADA;
  switch (chave) {
    case "vencimento":
      return {
        OR: valores.map((key) => ({ dueDate: { gte: inicioDoDia(key), lt: inicioDoDia(addDaysToKey(key, 1)) } })),
      };
    case "contraparte": {
      const ids = valores.filter((v) => v !== "");
      return ids.length ? { counterpartyId: { in: ids } } : NADA;
    }
    case "categoria":
      return porIds("categoryId", valores);
    case "centro":
      return porIds("costCenterId", valores);
    case "projeto":
      return porIds("projectId", valores);
    case "situacao":
      return { OR: valores.map((s) => whereDaSituacao(s as SituacaoDoFunil, hojeKey)) };
  }
}

/**
 * Os funis como uma lista para o `AND` do `where` — cada um num item, para
 * não brigar com as chaves do recorte (`status`, `paidAt`, `dueDate`, `OR`)
 * quando os dois se juntam por espalhamento.
 *
 * `exceto` deixa um funil de fora: é a cascata do Excel — o funil de uma
 * coluna oferece os valores das contas que passam pelos funis das outras.
 */
export function whereDosFunis(funis: FunisDasContas, hojeKey: string, exceto?: ChaveDoFunil): Prisma.FinanceEntryWhereInput[] {
  const lista: Prisma.FinanceEntryWhereInput[] = [];
  for (const chave of CHAVES_DOS_FUNIS) {
    const valores = funis[chave];
    if (valores === undefined || chave === exceto) continue;
    lista.push(whereDoFunil(chave, valores, hojeKey));
  }
  return lista;
}

/** "2026-10-08" → "08/10/2026", como `formatInstantDate` mostra o vencimento. */
export function diaDaChave(key: string): string {
  return DATA.test(key) ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : key;
}
