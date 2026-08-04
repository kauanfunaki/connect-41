// Regras puras de validade do token OAuth — sem banco e sem rede, pra a margem
// de renovação existir num lugar só e ser testável. Consumidores:
// getValidAccessToken (renova) e getMeetingIntegrationHealth (avisa na tela).

// Renova 2 minutos antes de vencer: uma requisição que começa válida pode
// terminar depois do vencimento, e o provedor recusaria no meio da operação.
export const TOKEN_EXPIRY_MARGIN_MS = 2 * 60 * 1000;

export function isTokenExpiringSoon(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() < TOKEN_EXPIRY_MARGIN_MS;
}

// Estado da conexão de reunião do usuário, do ponto de vista da interface.
export type IntegrationHealth =
  // Nunca conectou (ou desconectou) — a tela oferece "Conectar".
  | "NOT_CONNECTED"
  // Provedor sem credenciais no servidor: não dá pra afirmar nada sobre a
  // conta do usuário, e o erro não é dele. Distinto de NEEDS_RECONNECT de
  // propósito — mandar reconectar aqui seria mandar bater numa porta fechada.
  | "NOT_CONFIGURED"
  | "OK"
  // Token venceu e a renovação foi recusada (refresh revogado, consentimento
  // retirado, credencial trocada no console do provedor). Só reconectando.
  | "NEEDS_RECONNECT";
