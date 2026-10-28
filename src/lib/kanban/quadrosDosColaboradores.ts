// Quem cria e edita tarefas nos Quadros (28/10/2026, pedido do Kauan): "liberar
// a criação e edição de tarefas nos Quadros para os colaboradores, mas permitir
// aos coordenadores bloquear — por padrão, liberado".
//
// Até aqui, criar tarefa (a lista com colunas), criar atividade e mexer nas
// colunas era só de quem coordena o setor (`canManageSector`); o colaborador
// movia, comentava e editava o card. Agora o colaborador do setor faz as três
// coisas também, a não ser que o coordenador tenha bloqueado o setor.
//
// Continuam só com quem já podia: criar espaço e pasta (a estrutura do setor),
// excluir (o administrador, desde 13/10) e corrigir o apontamento de horas dos
// outros.
//
// Só regra: sem banco, para o teste e para servir à tela e às ações.

import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector } from "@/lib/auth/papeis";

type Quem = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">;

/**
 * Cria e edita tarefas e atividades nos Quadros do setor? O coordenador (e quem
 * tem acesso a tudo) sempre; o colaborador do setor, se o setor não estiver
 * bloqueado.
 */
export function podeEditarQuadros(ctx: Quem, sectorCode: string, bloqueado: boolean): boolean {
  if (canManageSector(ctx, sectorCode)) return true;
  return !bloqueado && canActOnSector(ctx, sectorCode);
}

/** Quem liga e desliga o bloqueio: quem coordena o setor. */
export function podeBloquearQuadros(ctx: Quem, sectorCode: string): boolean {
  return canManageSector(ctx, sectorCode);
}
