// Só para os testes dos carregadores: uma tela do motor com `fetch` simulado.
// Responde por caminho (sem a query); o que não estiver no mapa vira 404.

import { vi } from "vitest";
import { criarClienteDoMotor } from "@/lib/sped/motor";
import type { EstabelecimentoVisivel } from "../estabelecimentos";
import type { TelaDeLeitura } from "./comum";

export const ESTAB_SP: EstabelecimentoVisivel = { id: 3, cnpj: "17122471001147", rotulo: "SP", uf: "SP", matriz: false, ativo: true, obrigacoes: ["icms_ipi"], companyId: "c-sp", companyNome: "BLD SP", regime: null };
export const ESTAB_SC: EstabelecimentoVisivel = { id: 5, cnpj: "17122471000500", rotulo: "SC", uf: "SC", matriz: false, ativo: true, obrigacoes: ["icms_ipi"], companyId: "c-sc", companyNome: "BLD SC", regime: null };

type Resposta = unknown | ((url: URL) => Response | unknown);

export function telaDeTeste(rotas: Record<string, Resposta>, opcoes: { modulos?: string[]; estabelecimento?: EstabelecimentoVisivel | null; competencia?: string } = {}) {
  const chamadas: URL[] = [];
  const fetch = vi.fn(async (endereco: string | URL | Request) => {
    const url = new URL(String(endereco));
    chamadas.push(url);
    const caminho = url.pathname.replace("/api/connect/v1", "");
    const r = rotas[caminho];
    if (r === undefined) return new Response(JSON.stringify({ erro: "não", codigo: "nao_encontrado" }), { status: 404 });
    const v = typeof r === "function" ? (r as (u: URL) => unknown)(url) : r;
    return v instanceof Response ? v : new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const cliente = criarClienteDoMotor({ baseUrl: "https://motor", token: "t", tokenEscrita: null }, { fetch: fetch as unknown as typeof globalThis.fetch, esperar: async () => {} });
  const estabelecimento = opcoes.estabelecimento === undefined ? ESTAB_SP : opcoes.estabelecimento;
  const tela: TelaDeLeitura = {
    ctx: { tenantId: "t1" },
    motor: { cliente, escrita: false, raizes: ["17122471"] },
    contexto: { raiz: "17122471", estabelecimentoId: estabelecimento?.id ?? null, competencia: opcoes.competencia ?? "2026-09" },
    mapa: { visiveis: [ESTAB_SP, ESTAB_SC], semCadastro: [], semMotor: [] },
    estabelecimento,
    modulos: opcoes.modulos ?? ["fiscal_acervo", "fiscal_icms_ipi", "fiscal_contribuicoes", "fiscal_conferencia"],
  };
  return { tela, chamadas, fetch };
}

export const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...headers } });
