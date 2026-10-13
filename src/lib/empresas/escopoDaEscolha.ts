// O escopo das consultas das telas pesadas, a partir da empresa escolhida
// (13/10/2026). Regra pura, sem banco — é o que garante que Contas a pagar e
// a receber, Fluxo de caixa, Cobrança e Documentos fiscais só leem o acervo
// inteiro quando alguém pediu "Todas as empresas", e só onde a tela oferece.
//
// `null` quer dizer "a tela ainda não tem empresa": não se consulta nada, e a
// tela mostra o "Escolha uma empresa".

import type { AlcanceFiscal } from "@/lib/fiscal/alcance";
import type { EscolhaDaEmpresa } from "./escolhaDaEmpresa";

/** O mesmo formato de `EscopoFinanceiro` (`src/lib/financeiro/consultas.ts`). */
export type EscopoDaEscolha = { tenantId: string; companyIds: string[] | null };

/**
 * O escopo do financeiro: a empresa escolhida, ou o tenant inteiro só quando
 * a escolha é "todas" e a tela permite (lista com teto). Sem empresa, `null`.
 */
export function escopoFinanceiroDaEscolha(
  tenantId: string,
  escolha: EscolhaDaEmpresa,
  opcoes: { permitirTodas?: boolean } = {}
): EscopoDaEscolha | null {
  if (escolha.tipo === "empresa") return { tenantId, companyIds: [escolha.companyId] };
  if (escolha.tipo === "todas" && opcoes.permitirTodas) return { tenantId, companyIds: null };
  return null;
}

/**
 * O alcance do acervo fiscal na tela da equipe: **sempre uma empresa**. O
 * acervo inteiro (252 mil documentos em 13/10/2026, num banco de cache
 * pequeno) não se lê por tela — busca por texto e filtro raro varriam a
 * tabela. Com a empresa, as competências saem pelo índice da empresa (ver
 * `competenciasDisponiveis`).
 */
export function alcanceFiscalDaEscolha(tenantId: string, escolha: EscolhaDaEmpresa): AlcanceFiscal | null {
  return escolha.tipo === "empresa" ? { tipo: "EMPRESAS", tenantId, companyIds: [escolha.companyId] } : null;
}
