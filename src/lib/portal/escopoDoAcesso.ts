// O escopo de um acesso do portal — a régua que a Ceci do portal usa em toda
// consulta (21/10/2026, fase 1 da Ceci no portal).
//
// As telas do portal já filtram pelas empresas do acesso (`alcanceDoCliente`),
// mas cada módulo tem o seu tipo de escopo, e dois deles aceitam
// `companyIds: null` como "o escritório inteiro" (`EscopoFinanceiro`,
// `EscopoDePendencias`) — é o que a equipe usa. Na tela, quem monta o escopo é
// o código; na IA, quem escolhe empresa, filtro e id é o modelo, a partir do
// que o cliente escreveu. Por isso a IA do portal não monta escopo de módulo
// nenhum à mão: recebe um `EscopoDoAcesso`, lido do banco pela conta da sessão,
// e as conversões daqui, que nunca produzem `null` nem lista maior que a do
// acesso.
//
// Empresa pedida fora do acesso vira lista vazia (`IN ()`, nada), nunca erro
// tratado depois nem "ignora o filtro" — ignorar o filtro devolveria todas as
// empresas do acesso, o que é inofensivo, mas esconde do modelo que o pedido
// não valia.

import type { AlcanceFiscal } from "@/lib/fiscal/alcance";
import type { EscopoFinanceiro } from "@/lib/financeiro/consultas";
import type { EscopoDePendencias } from "@/lib/financeiro/pendencias/consultas";
import type { EscopoDoCliente } from "@/lib/solicitacoes/consultas";
import { getPrisma } from "@/lib/prisma";
import { idsDasEmpresasDaConta, type BancoDoPortal } from "./empresasDaContaDb";

declare const doAcesso: unique symbol;

/**
 * As empresas que UM acesso do portal enxerga, no escritório dele. A marca
 * (`doAcesso`) só existe para o compilador: um objeto escrito à mão com
 * `tenantId` e `companyIds` não passa por aqui.
 */
export type EscopoDoAcesso = {
  readonly tenantId: string;
  readonly portalUserId: string;
  readonly companyIds: readonly string[];
  readonly [doAcesso]: true;
};

/** Monta o escopo. Só `lerEscopoDoAcesso` e os testes chamam — a lista tem de vir da regra do portal. */
export function montarEscopoDoAcesso(tenantId: string, portalUserId: string, companyIds: readonly string[]): EscopoDoAcesso {
  return Object.freeze({ tenantId, portalUserId, companyIds: Object.freeze([...new Set(companyIds)]) }) as EscopoDoAcesso;
}

/**
 * O escopo da conta, lido do banco: as empresas pela regra do portal
 * (`empresasDaConta.ts`, com as filiais), e nada se a conta não está ativa no
 * escritório — o token do portal vive até 30 dias, e a IA não pode responder
 * a uma conta desativada hoje de manhã.
 */
export async function lerEscopoDoAcesso(tenantId: string, portalUserId: string, db?: BancoDoPortal): Promise<EscopoDoAcesso> {
  const prisma = db ?? (getPrisma() as unknown as BancoDoPortal);
  const ativa = await prisma.portalUser.findFirst({ where: { id: portalUserId, tenantId, active: true }, select: { id: true } });
  if (!ativa) return montarEscopoDoAcesso(tenantId, portalUserId, []);
  return montarEscopoDoAcesso(tenantId, portalUserId, await idsDasEmpresasDaConta(tenantId, portalUserId, db));
}

/** A empresa é do acesso? */
export function acessoVeEmpresa(e: EscopoDoAcesso, companyId: string): boolean {
  return e.companyIds.includes(companyId);
}

/**
 * O escopo recortado numa empresa. Sem empresa, o escopo inteiro; empresa do
 * acesso, só ela; empresa de fora (de outro cliente, de outro escritório, id
 * inventado), nada.
 */
export function naEmpresa(e: EscopoDoAcesso, companyId?: string | null): EscopoDoAcesso {
  if (!companyId) return e;
  return montarEscopoDoAcesso(e.tenantId, e.portalUserId, acessoVeEmpresa(e, companyId) ? [companyId] : []);
}

// As conversões para o escopo de cada módulo. Sempre cópia da lista (o módulo
// não mexe na do acesso) e nunca `null`.

/** Notas fiscais (`src/lib/fiscal/data.ts`). */
export function alcanceFiscalDoAcesso(e: EscopoDoAcesso): AlcanceFiscal {
  return { tipo: "EMPRESAS", tenantId: e.tenantId, companyIds: [...e.companyIds] };
}

/** Contas a pagar e a receber (`src/lib/financeiro/consultas.ts`). */
export function escopoFinanceiroDoAcesso(e: EscopoDoAcesso): EscopoFinanceiro & { companyIds: string[] } {
  return { tenantId: e.tenantId, companyIds: [...e.companyIds] };
}

/** Pendências (`src/lib/financeiro/pendencias/consultas.ts`) — todas as do cliente, de qualquer setor. */
export function escopoDePendenciasDoAcesso(e: EscopoDoAcesso): EscopoDePendencias & { companyIds: string[] } {
  return { tenantId: e.tenantId, companyIds: [...e.companyIds], setores: null };
}

/** Solicitações e processos (`src/lib/solicitacoes/consultas.ts`, `src/lib/societario/portal-data.ts`). */
export function escopoDoClienteDoAcesso(e: EscopoDoAcesso): EscopoDoCliente {
  return { tenantId: e.tenantId, companyIds: [...e.companyIds] };
}
