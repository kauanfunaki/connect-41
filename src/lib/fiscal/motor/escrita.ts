// Quem vê os botões das escritas de §13 nas telas fiscais (23/10/2026). Puro.
//
// A tela calcula isto no servidor e passa aos botões; a Server Action (ou a
// rota de envio) confere de novo tudo, e o motor por último.
//
// - Sem `agir` no módulo da tela, os botões **somem**: a pessoa consulta, e a
//   tela diz uma vez por quê.
// - Sem o token de escrita na integração, os botões **aparecem desabilitados**
//   com o motivo: é configuração, e quem administra sabe onde resolver.

export type PermissaoDeEscrita = {
  /** Pode clicar. */
  pode: boolean;
  /** Os botões aparecem (desabilitados quando `pode` é falso). */
  visivel: boolean;
  /** Por que não pode, para a tela dizer. */
  motivo: string | null;
};

export const SEM_TOKEN_DE_ESCRITA = "Escrita do SPED não habilitada: falta o token de escrita na integração (Administração › Integrações). Por enquanto, só consulta.";
export const SEM_PERFIL_DE_ESCRITA = "Seu perfil consulta esta tela, mas não grava no motor SPED.";

export function permissaoDeEscrita(fontes: { agir: boolean; tokenDeEscrita: boolean }): PermissaoDeEscrita {
  if (!fontes.agir) return { pode: false, visivel: false, motivo: SEM_PERFIL_DE_ESCRITA };
  if (!fontes.tokenDeEscrita) return { pode: false, visivel: true, motivo: SEM_TOKEN_DE_ESCRITA };
  return { pode: true, visivel: true, motivo: null };
}
