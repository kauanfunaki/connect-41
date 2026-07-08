import { canWrite, isFullWrite, type AuthContext } from "@/lib/auth/context";

// ─────────────────────────────────────────────────────────────────────────────
// Política de autorização de ESCRITA sobre entidades de negócio (Empresa,
// Pessoa/Colaborador, Candidato). Ponto único de decisão — antes a regra estava
// espalhada como `canWrite(role)` em cada action.
//
// COMPORTAMENTO ATUAL (decisão registrada): escrita é tenant-wide para quem tem
// canWrite (SUPER_ADMIN/ADMIN/SECTOR_ADMIN). Empresas e Pessoas são tratadas
// como "conhecimento geral da empresa".
//
// PARA RESTRINGIR POR SETOR no futuro (achado C5 da auditoria): basta trocar o
// corpo de canWriteEntity pela versão comentada abaixo e passar os setores da
// entidade nos call sites. Nenhuma outra parte do código precisa mudar.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reservado para a versão restrita por setor (ver comentário abaixo)
export function canWriteEntity(ctx: AuthContext, _entitySectors: string[] = []): boolean {
  return canWrite(ctx.role);

  // Versão restrita por setor (trocar quando/se for decidido apertar):
  // if (isFullWrite(ctx.role)) return true;         // SUPER_ADMIN / ADMIN
  // if (ctx.role === "READONLY") return false;
  // return _entitySectors.some((s) => ctx.sectors.includes(s));
}

// Reexport utilitário para deixar claro que a decisão "admin do tenant pode tudo"
// continua valendo onde for chamado.
export { isFullWrite };
