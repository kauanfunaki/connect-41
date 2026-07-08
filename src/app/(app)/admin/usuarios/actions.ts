"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { assignableRoles } from "@/lib/roles";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/sessions";

export type UsuarioState = { error: string } | null;

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export async function criarUsuario(
  _prev: UsuarioState,
  form: FormData
): Promise<UsuarioState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para gerenciar usuários." };

  const name = (form.get("name") as string)?.trim();
  const email = (form.get("email") as string)?.trim().toLowerCase();
  const password = (form.get("password") as string) ?? "";
  const role = form.get("role") as UserRole;
  const sectors = (form.getAll("sectors") as string[]).filter(Boolean);

  if (!name) return { error: "Nome é obrigatório" };
  if (!email) return { error: "E-mail é obrigatório" };
  if (password.length < 8) return { error: "Senha deve ter ao menos 8 caracteres" };
  if (!assignableRoles(ctx.role).includes(role)) return { error: "Papel inválido." };

  const prisma = getPrisma();
  let id: string;

  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        email,
        passwordHash,
        role,
        sectors: { create: sectors.map((s) => ({ sectorCode: s })) },
      },
    });
    id = user.id;
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe um usuário com este e-mail." };
    console.error("[criarUsuario]", err);
    return { error: "Erro ao criar usuário. Tente novamente." };
  }

  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios/${id}/editar`);
}

export async function atualizarUsuario(
  _prev: UsuarioState,
  form: FormData
): Promise<UsuarioState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para gerenciar usuários." };

  const id = form.get("id") as string;
  const name = (form.get("name") as string)?.trim();
  const email = (form.get("email") as string)?.trim().toLowerCase();
  const password = (form.get("password") as string) ?? "";
  const role = form.get("role") as UserRole;
  const sectors = (form.getAll("sectors") as string[]).filter(Boolean);
  const active = form.get("active") === "on";

  if (!name) return { error: "Nome é obrigatório" };
  if (!email) return { error: "E-mail é obrigatório" };
  if (!assignableRoles(ctx.role).includes(role)) return { error: "Papel inválido." };
  if (id === ctx.userId && !active) {
    return { error: "Você não pode desativar sua própria conta." };
  }

  const prisma = getPrisma();

  const existing = await prisma.user.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return { error: "Usuário não encontrado." };
  if (existing.role === "SUPER_ADMIN" && ctx.role !== "SUPER_ADMIN") {
    return { error: "Apenas Super Admin pode editar outro Super Admin." };
  }
  if (id === ctx.userId && role !== existing.role) {
    return { error: "Você não pode alterar seu próprio papel." };
  }

  try {
    const passwordHash = password ? await hashPassword(password) : undefined;
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          name,
          email,
          role,
          active,
          ...(passwordHash ? { passwordHash } : {}),
        },
      }),
      prisma.userSector.deleteMany({ where: { userId: id } }),
      ...(sectors.length > 0
        ? [prisma.userSector.createMany({ data: sectors.map((s) => ({ userId: id, sectorCode: s })) })]
        : []),
    ]);
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe um usuário com este e-mail." };
    console.error("[atualizarUsuario]", err);
    return { error: "Erro ao atualizar usuário." };
  }

  // Trocar senha ou desativar a conta encerra as sessões abertas do usuário.
  if (password.length > 0 || !active) {
    await revokeAllUserSessions(id);
  }

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

export async function alternarAtivoUsuario(id: string, novoStatus: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;
  if (id === ctx.userId && !novoStatus) return;

  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;
  if (existing.role === "SUPER_ADMIN" && ctx.role !== "SUPER_ADMIN") return;

  try {
    await prisma.user.update({ where: { id }, data: { active: novoStatus } });
    if (!novoStatus) await revokeAllUserSessions(id);
  } catch (err) {
    console.error("[alternarAtivoUsuario]", err);
    return;
  }

  revalidatePath("/admin/usuarios");
}

export async function alternarAtivoEmMassa(ids: string[], novoStatus: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role) || ids.length === 0) return;

  const targetIds = ids.filter((id) => id !== ctx.userId || novoStatus);
  if (targetIds.length === 0) return;

  const prisma = getPrisma();
  const where =
    ctx.role === "SUPER_ADMIN"
      ? { id: { in: targetIds }, tenantId: ctx.tenantId }
      : { id: { in: targetIds }, tenantId: ctx.tenantId, role: { not: "SUPER_ADMIN" as const } };

  await prisma.user.updateMany({ where, data: { active: novoStatus } });

  // Desativar em massa também encerra as sessões dos alvos.
  if (!novoStatus) {
    await prisma.refreshToken.updateMany({
      where: { userId: { in: targetIds }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revalidatePath("/admin/usuarios");
}

export async function atribuirSetorEmMassa(ids: string[], sectorCode: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role) || ids.length === 0 || !sectorCode) return;

  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenantId },
    select: { id: true },
  });

  await prisma.userSector.createMany({
    data: users.map((u) => ({ userId: u.id, sectorCode })),
    skipDuplicates: true,
  });

  revalidatePath("/admin/usuarios");
}
