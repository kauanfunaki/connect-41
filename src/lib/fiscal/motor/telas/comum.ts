// O que os carregadores das telas fiscais de §11 têm em comum (23/10/2026).
//
// Cada carregador recebe o recorte já conferido (`prepararTelaDoMotor`) e
// devolve `Leitura`s — o dado ou o erro em português com o código —, nunca
// lança. Antes de qualquer chamada, confere de novo o módulo da tela no nível
// "ver": a página já abriu pelo gate (`abrirTelaDoModulo`), mas o carregador
// não depende de quem o chama para não ler o que a pessoa não vê.

import type { TelaDoMotor } from "../tela";
import type { FalhaDaLeitura, Leitura } from "../leitura";
import { param } from "../url";

export type TelaDeLeitura = Pick<TelaDoMotor, "motor" | "contexto" | "mapa" | "estabelecimento" | "modulos" | "contabil"> & { ctx: Pick<TelaDoMotor["ctx"], "tenantId"> };
export type Params = Record<string, string | string[] | undefined>;

export const MODULO = {
  documentos: "fiscal_acervo",
  icmsIpi: "fiscal_icms_ipi",
  contribuicoes: "fiscal_contribuicoes",
  conferencia: "fiscal_conferencia",
} as const;

export function falha(erro: string, codigo: string | null = null, status = 0): FalhaDaLeitura {
  return { dados: null, erro, codigo, status, retryAfter: null };
}

export const SEM_PERMISSAO = "Você não tem acesso a este módulo fiscal.";
export const SEM_ESTABELECIMENTO = "Escolha um estabelecimento no filtro acima.";

/** Quem não vê o módulo não lê nada dele (o mesmo "ver" de `abrirTelaDoModulo`). */
export function podeLer(tela: TelaDeLeitura, modulo: string): boolean {
  if (tela.contabil) return modulo === MODULO.contribuicoes && tela.modulos.includes("contabil_sped");
  return tela.modulos.includes(modulo);
}

/** Um cursor opaco do motor, vindo da URL. Só confere o tamanho: o formato é do motor. */
export function cursorDaUrl(params: Params, nome: string): string | null {
  const c = param(params, nome);
  return c && c.length <= 500 ? c : null;
}

export function inteiroDaUrl(params: Params, nome: string): number | null {
  const n = Number(param(params, nome));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Um valor da URL só quando é uma das opções conhecidas. */
export function opcaoDaUrl<T extends string>(params: Params, nome: string, opcoes: readonly T[]): T | undefined {
  const v = param(params, nome);
  return v && (opcoes as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function primeiroEUltimoDia(competencia: string): [string, string] {
  const [a, m] = competencia.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return [`${competencia}-01`, `${competencia}-${String(fim).padStart(2, "0")}`];
}

export type { Leitura };
