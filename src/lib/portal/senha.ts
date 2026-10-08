// A regra da senha do cliente no portal, num lugar só (08/10/2026): a senha
// nova pelo link do e-mail (`redefinir-senha`) e a troca em "Minha conta"
// conferem a mesma coisa, com as mesmas palavras. O mínimo é o mesmo da equipe
// (`alterarMinhaSenha`, em configurações).

export const MINIMO_DA_SENHA = 8;

/** A dica embaixo do campo de senha nova. */
export const DICA_DA_SENHA = `Ao menos ${MINIMO_DA_SENHA} caracteres.`;

/** O que há de errado com a senha nova e a confirmação, ou `null` se servem. */
export function problemaDaSenhaNova(senha: string, confirmacao: string): string | null {
  if (senha.length < MINIMO_DA_SENHA) return `A senha precisa ter ao menos ${MINIMO_DA_SENHA} caracteres.`;
  if (senha !== confirmacao) return "As senhas não coincidem.";
  return null;
}
