// Formatação das telas do Contábil Core (Fase 2, 09/11/2026). Puro: serve ao servidor e ao navegador.

import { dec } from "./motor/decimal";
import { reais } from "./motor/valorConfiavel";

/** "R$ 1.234,56" a partir do decimal do banco, sem passar por ponto flutuante. */
export function moeda(valor: { toString(): string } | string | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return reais(dec(valor.toString()));
}

/** Valor com o sinal da direção: débito sai negativo. */
export function moedaComSinal(valor: { toString(): string }, dc: string): string {
  const t = moeda(valor);
  return dc === "D" ? `- ${t}` : t;
}

/** "SICOOB 1234 98765-4" */
export function rotuloDaAgencia(a: { bancoSigla: string; agencia: string; numero: string; digito: string | null }): string {
  return `${a.bancoSigla} ${a.agencia} ${a.numero}${a.digito ? `-${a.digito}` : ""}`;
}

/** "1.1.1.01 · Banco Sicoob" */
export function rotuloDaConta(c: { codigo: string; descricao: string; contaNumero?: number | null }): string {
  return `${c.codigo}${c.contaNumero != null ? ` (${c.contaNumero})` : ""} · ${c.descricao}`;
}

export const ROTULO_DO_REGIME: Record<string, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

export const ROTULO_DO_TIPO_DE_CONTA: Record<string, string> = {
  ativo: "Ativo",
  passivo: "Passivo",
  patrimonio_liquido: "Patrimônio líquido",
  receita: "Receita",
  despesa: "Despesa",
  custo: "Custo",
  resultado: "Resultado",
};

// "painel" (Fase D1) é a primeira e a que abre: era a tela inicial do original (o `Dashboard`). "relatorios"
// (Fase D2) é a página Relatórios do original (DRE, Balancete e Livro Caixa).
export const ABAS = ["painel", "importacoes", "extrato", "neo", "regras", "contrapartes", "registros", "notas", "comprovantes", "cartoes", "conciliacao", "relatorios", "configuracoes"] as const;
export type Aba = (typeof ABAS)[number];

/**
 * A página que dá para mostrar (27/11/2026, melhoria-571): a pedida, sem passar da última. Página além do
 * fim (link antigo, a última esvaziou depois de classificar ou desativar) cai na última que tem linhas;
 * lista vazia é a página 1.
 */
export function paginaNoIntervalo(pedida: number, total: number, porPagina: number): number {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  const p = Number.isFinite(pedida) ? Math.floor(pedida) : 1;
  return Math.min(Math.max(1, p), ultima);
}

/**
 * Lê uma página no banco (melhoria-571): conta o recorte e busca a página pedida ao mesmo tempo; se ela
 * passou do fim, busca de novo a última. Quem chama monta o `count` e o `findMany` com o mesmo `where`.
 */
export async function lerPagina<T>(
  pedida: number,
  porPagina: number,
  contar: () => Promise<number>,
  buscar: (skip: number, take: number) => Promise<T[]>,
): Promise<{ itens: T[]; total: number; pagina: number }> {
  const inicial = paginaNoIntervalo(pedida, Number.MAX_SAFE_INTEGER, porPagina);
  const [total, primeira] = await Promise.all([contar(), buscar((inicial - 1) * porPagina, porPagina)]);
  const pagina = paginaNoIntervalo(inicial, total, porPagina);
  const itens = pagina === inicial ? primeira : await buscar((pagina - 1) * porPagina, porPagina);
  return { itens, total, pagina };
}

/** Competência do mês corrente, "AAAA-MM", no fuso do escritório. */
export function mesAtual(agora = new Date()): string {
  // en-CA formata ano e mês como "2026-11".
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(agora);
}
