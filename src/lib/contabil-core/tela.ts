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

export const ABAS = ["importacoes", "extrato", "neo", "regras", "contrapartes", "registros", "conciliacao", "configuracoes"] as const;
export type Aba = (typeof ABAS)[number];

/** Competência do mês corrente, "AAAA-MM", no fuso do escritório. */
export function mesAtual(agora = new Date()): string {
  // en-CA formata ano e mês como "2026-11".
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(agora);
}
