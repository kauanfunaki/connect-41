"use server";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { reissueAccessTokenForSelf } from "@/lib/auth/sessions";

export type WorkspaceState = { error: string } | null;

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function criarWorkspace(_prev: WorkspaceState, form: FormData): Promise<WorkspaceState> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return { error: "Sem permissão para criar workspaces." };

  const name = (form.get("name") as string)?.trim();
  const cnpj = (form.get("cnpj") as string)?.trim() || null;

  if (!name) return { error: "Nome é obrigatório" };
  if (!cnpj) return { error: "CNPJ é obrigatório" };

  const prisma = getPrisma();
  const baseSlug = slugify(name) || "workspace";
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  let id: string;
  try {
    const tenant = await prisma.tenant.create({ data: { name, cnpj, slug } });
    id = tenant.id;
    // Quem cria o workspace já sai com acesso a ele.
    await prisma.userTenantAccess.create({ data: { userId: ctx.userId, tenantId: id } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe um workspace com este CNPJ." };
    console.error("[criarWorkspace]", err);
    return { error: "Erro ao criar workspace. Tente novamente." };
  }

  // Sem isto o workspace recém-criado fica inacessível: a concessão está no
  // banco, mas o access token em uso ainda carrega a lista antiga de tenants.
  await reissueAccessTokenForSelf(ctx.userId);

  revalidatePath("/admin/workspaces");
  redirect(`/admin/workspaces/${id}`);
}

export async function concederAcesso(tenantId: string, userId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return;

  const prisma = getPrisma();
  try {
    await prisma.userTenantAccess.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: { userId, tenantId },
      update: {},
    });
  } catch (err) {
    console.error("[concederAcesso]", err);
    return;
  }

  // Concedendo pra si mesmo, o token precisa ser reemitido na hora. Pra outro
  // usuário não dá — o acesso dele entra no próximo refresh (até 15min).
  if (userId === ctx.userId) await reissueAccessTokenForSelf(ctx.userId);

  revalidatePath(`/admin/workspaces/${tenantId}`);
}

export async function revogarAcesso(tenantId: string, userId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return;

  const prisma = getPrisma();
  try {
    await prisma.userTenantAccess.delete({
      where: { userId_tenantId: { userId, tenantId } },
    });
  } catch (err) {
    console.error("[revogarAcesso]", err);
    return;
  }

  // Revogando o próprio acesso, reemitir também tira o tenant do token — senão
  // ele continuaria autorizando a troca até o access token expirar.
  if (userId === ctx.userId) await reissueAccessTokenForSelf(ctx.userId);

  revalidatePath(`/admin/workspaces/${tenantId}`);
}
