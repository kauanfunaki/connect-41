import { alcanceVazio, type AlcanceFiscal } from "@/lib/fiscal/alcance";
import { idsDasEmpresasDaConta } from "@/lib/portal/empresasDaContaDb";
import type { PortalAccessTokenPayload } from "@/lib/auth/types";

/**
 * Alcance do cliente logado: as empresas ligadas ao acesso dele.
 *
 * A contrapartida de `alcanceDaEquipe`, e o motivo de `AlcanceFiscal` existir
 * como tipo desde a etapa 3 — a camada de dados já recebia isto como primeiro
 * argumento antes de o portal existir. Aqui não se escreve `where` nenhum novo:
 * só se monta o alcance e se entrega.
 *
 * Desde 14/10/2026 a origem é a ligação direta do acesso com as empresas (com
 * as filiais, quando a ligação as inclui — ver `src/lib/portal/empresasDaConta.ts`),
 * e não mais o Cliente. As ~32 telas do portal continuam recebendo a mesma
 * lista de empresas; só a origem dela mudou, e mora aqui.
 *
 * **Sem empresa resolve para NADA**, nunca para tudo. Uma conta sem empresa
 * nenhuma recebe `IN ()`, que não casa com linha alguma. É o caso que uma
 * cláusula montada por concatenação transformaria em acesso total.
 *
 * Lido do banco a cada pergunta, pela conta (`sub`) e pelo escritório do
 * token: ligar ou desligar uma empresa vale na próxima tela, sem a pessoa
 * precisar entrar de novo.
 */
export async function alcanceDoCliente(sessao: PortalAccessTokenPayload): Promise<AlcanceFiscal> {
  const companyIds = await idsDasEmpresasDaConta(sessao.tenantId, sessao.sub);
  if (companyIds.length === 0) return alcanceVazio(sessao.tenantId);
  return { tipo: "EMPRESAS", tenantId: sessao.tenantId, companyIds };
}
