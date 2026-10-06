import type { UserRole } from "@/generated/prisma/enums";

// A troca de escritório (tenant), em funções puras — sem banco e sem Next, para
// o proxy (que decide antes de qualquer página) e o layout (que mostra a troca)
// seguirem a MESMA regra, e para ela ser testada com contextos simulados.
//
// Como funciona (conferido em 06/10/2026, a pedido da revisão de 05/10):
//
// 1. Na entrada e a cada refresh, o token ganha `accessibleTenants` —
//    `escritoriosAcessiveis` abaixo. Só SUPER_ADMIN recebe lista; os demais
//    papéis recebem lista vazia, MESMO com concessão gravada no banco.
// 2. A janela de troca grava o cookie `active_tenant_id` e recarrega.
// 3. O proxy só aceita o cookie se o escritório estiver no token
//    (`identidadeNoEscritorio`). Cookie forjado, de escritório fora da lista,
//    cai no escritório de origem da conta — sem erro e sem acesso.
//
// "Uma conta com acesso a dois escritórios" (concessão) é coisa do suporte:
// SUPER_ADMIN visita o escritório inteiro, sem setor próprio lá. Quem trabalha
// de verdade em dois escritórios — papel e setores próprios em cada um — tem
// DUAS contas com o mesmo e-mail, e escolhe o escritório na entrada (ver
// `entradaDaEquipe.ts`).

/**
 * Os escritórios que a conta pode abrir pela troca, incluindo o de origem.
 * Vazio = sem troca (todo papel que não é SUPER_ADMIN).
 *
 * A concessão (`UserTenantAccess`) só vale para SUPER_ADMIN: os setores de uma
 * conta (`UserSector`) não têm escritório, são os do escritório de origem, e
 * não haveria com que setores um usuário comum entraria no outro.
 */
export function escritoriosAcessiveis(role: UserRole, homeTenantId: string, concedidos: readonly string[]): string[] {
  if (role !== "SUPER_ADMIN") return [];
  return [...new Set([homeTenantId, ...concedidos])];
}

/**
 * O escritório e os setores com que a requisição roda, a partir do token e do
 * cookie `active_tenant_id`.
 *
 * Fora do escritório de origem, os setores vão vazios: são os da conta no
 * escritório dela, e os códigos de setor são por escritório. Quem chega assim
 * é SUPER_ADMIN, full access, e o seletor oferece os setores do escritório
 * visitado (ver `setoresDoSeletor`).
 */
export function identidadeNoEscritorio(
  token: { tenantId: string; sectors: string[]; accessibleTenants?: string[] },
  cookieDoEscritorio: string | null | undefined
): { tenantId: string; sectors: string[] } {
  const tenantId =
    cookieDoEscritorio && token.accessibleTenants?.includes(cookieDoEscritorio) ? cookieDoEscritorio : token.tenantId;
  return { tenantId, sectors: tenantId === token.tenantId ? token.sectors : [] };
}

/**
 * Os escritórios que a janela de troca lista. Com um só (o atual), a troca de
 * escritório não aparece — o menu e o cabeçalho só a oferecem com mais de um.
 */
export function escritoriosDaTroca(acessiveis: readonly string[], tenantAtual: string): string[] {
  return acessiveis.length > 0 ? [...acessiveis] : [tenantAtual];
}
