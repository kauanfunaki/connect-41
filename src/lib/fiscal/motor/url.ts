// Endereços das telas fiscais no modo real (22/10/2026). Puro.
//
// O recorte (raiz, estabelecimento, competência) mora na URL, como os filtros
// das outras telas: copiável, e o voltar do navegador desfaz.

import type { ContextoDoMotor } from "./estabelecimentos";

export function hrefDoMotor(caminho: string, contexto: ContextoDoMotor | null, extra: Record<string, string | number | null | undefined> = {}): string {
  const q = new URLSearchParams();
  if (contexto) {
    q.set("raiz", contexto.raiz);
    if (contexto.estabelecimentoId !== null) q.set("estab", String(contexto.estabelecimentoId));
    q.set("competencia", contexto.competencia);
  }
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${caminho}?${s}` : caminho;
}

/** O primeiro valor de um parâmetro de `searchParams`. */
export function param(params: Record<string, string | string[] | undefined>, nome: string): string | undefined {
  const v = params[nome];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * O endereço atual com mudanças: `null` tira o parâmetro. Para "tentar de
 * novo", paginação e o clique numa linha, sem perder o resto do recorte.
 */
export function hrefComParams(caminho: string, params: Record<string, string | string[] | undefined>, mudancas: Record<string, string | number | null | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const valor = Array.isArray(v) ? v[0] : v;
    if (valor !== undefined && valor !== "") q.set(k, valor);
  }
  for (const [k, v] of Object.entries(mudancas)) {
    if (v === null || v === undefined || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${caminho}?${s}` : caminho;
}
