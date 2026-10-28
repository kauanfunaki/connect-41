// O acesso pela ficha da pessoa (lote 8, 28/10/2026 — decisão do Kauan nas
// perguntas do lote 7): o colaborador interno ganha a aba "Acesso", onde o
// administrador cria a conta, troca papel e setores e liga uma conta que já
// existe. Configurações › Usuários continua — é a lista de papéis, assentos e
// Chatwoot —, e o formulário é o mesmo nos dois lugares.
//
// Regras puras, para o teste não depender do Prisma.

const PADRAO = "/admin/usuarios";

/**
 * Para onde o formulário do usuário volta depois de salvar. Só aceita a ficha
 * de uma pessoa (na aba Acesso) — o valor vem do formulário, e um endereço
 * qualquer viraria redirecionamento aberto.
 */
export function destinoDepoisDoUsuario(valor: unknown): string {
  if (typeof valor !== "string") return PADRAO;
  return /^\/pessoas\/[A-Za-z0-9-]{1,64}\?tab=acesso$/.test(valor) ? valor : PADRAO;
}

/** O endereço da aba Acesso de uma pessoa. */
export function abaDeAcesso(personId: string): string {
  return `/pessoas/${personId}?tab=acesso`;
}

/** As contas que ainda podem ser ligadas: as do escritório que nenhuma pessoa usa. */
export function contasLivres<T extends { id: string }>(contas: readonly T[], ligadas: ReadonlySet<string>): T[] {
  return contas.filter((c) => !ligadas.has(c.id));
}
