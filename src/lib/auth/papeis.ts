// As regras de papel da equipe — funções puras, sem banco nem cabeçalho.
//
// Viviam em ./context.ts, que lê os cabeçalhos do proxy (next/headers) e o
// Prisma. Saíram para cá em 09/10/2026 porque os Arquivos usam estas regras em
// componente de cliente e no motor de alertas, que roda na instrumentação, e
// nenhum dos dois pode puxar next/headers. ./context.ts reexporta tudo.

import type { UserRole } from "@/generated/prisma/enums";
import type { AuthContext } from "./context";

/** O que as regras leem de quem pede. */
type Quem = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">;

// SUPER_ADMIN e ADMIN enxergam/gerenciam tudo do tenant; READONLY enxerga tudo mas nunca escreve.
export function isFullAccess(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "READONLY";
}

export function isFullWrite(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/**
 * Quem pode EXCLUIR — registro ou configuração — no Connect: só Administrador
 * e Super Admin.
 *
 * Regra do Kauan, 13/10/2026: "Usuário, coordenador e gestor não pode excluir
 * nada, só admin e super admin." Antes cada tela decidia sozinha, e quase todas
 * deixavam o gestor do setor (SECTOR_ADMIN) excluir com `canManageSector` ou
 * `canWrite`. O gestor continua criando e editando como antes; só a exclusão
 * sobe para o administrador.
 *
 * Ficam de fora, de propósito, os gestos do dia a dia que apagam uma linha sem
 * apagar dado de ninguém: desmarcar tag/responsável/participante/vínculo de um
 * card, desfazer conciliação ou baixa, voltar uma configuração ao padrão,
 * mandar arquivo para a lixeira (restaurável por 30 dias), rascunho de envio e
 * as coisas pessoais (notificação, conversa com a IA, tela fixada, conexão com
 * o Google). Esses seguem com a permissão que já tinham.
 *
 * Assinatura em somente leitura bloqueia, como bloqueia qualquer escrita.
 */
export function podeExcluir(ctx: Pick<Quem, "role" | "subscriptionReadOnly">): boolean {
  if (ctx.subscriptionReadOnly) return false;
  return isFullWrite(ctx.role);
}

/** A frase que a tela mostra quando alguém fora do administrador tenta excluir. */
export const SO_ADMIN_EXCLUI = "Só o Administrador ou o Super Admin pode excluir.";

// Pode criar/editar/excluir (fora do escopo estrito de setor de pipeline).
// Excluir, desde 13/10/2026, passa também por `podeExcluir`.
export function canWrite(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "SECTOR_ADMIN";
}

// Pode registrar atividade (nota, mudança de estágio) — inclui SECTOR_USER.
export function canAct(role: UserRole): boolean {
  return role !== "READONLY";
}

// Um setor ou os setores de uma tela (21/10/2026): uma tela ligada a mais de um
// setor abre para quem alcança **algum** deles, no mesmo nível de sempre. Com
// um setor só, a regra é a de antes, letra por letra.
type SetorOuSetores = string | readonly string[];

function eDeAlgum(ctx: Quem, setores: SetorOuSetores): boolean {
  return typeof setores === "string" ? ctx.sectors.includes(setores) : setores.some((s) => ctx.sectors.includes(s));
}

export function canManageSector(ctx: Quem, sectorCode: SetorOuSetores): boolean {
  if (ctx.subscriptionReadOnly) return false;
  if (isFullWrite(ctx.role)) return true;
  if (ctx.role === "READONLY") return false;
  return ctx.role === "SECTOR_ADMIN" && eDeAlgum(ctx, sectorCode);
}

export function canActOnSector(ctx: Quem, sectorCode: SetorOuSetores): boolean {
  if (ctx.subscriptionReadOnly) return false;
  if (isFullAccess(ctx.role)) return ctx.role !== "READONLY";
  return eDeAlgum(ctx, sectorCode);
}

export function canViewSector(ctx: Quem, sectorCode: SetorOuSetores): boolean {
  if (isFullAccess(ctx.role)) return true;
  return eDeAlgum(ctx, sectorCode);
}
