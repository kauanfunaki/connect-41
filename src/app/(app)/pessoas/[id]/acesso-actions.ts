"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";

export type LigacaoState = { erro: string } | { ok: true } | null;

/**
 * Liga ou desliga a conta de acesso de um colaborador interno, pela aba
 * Acesso da ficha (lote 8, 28/10/2026). Mesma regra de quem cuida de
 * Configurações › Usuários (`isFullWrite`), e não a de quem edita a pessoa:
 * ligar uma conta é dar acesso.
 */
export async function ligarContaDaPessoa(personId: string, userId: string | null): Promise<LigacaoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { erro: "Só quem administra os usuários liga a conta de acesso." };

  const prisma = getPrisma();
  const pessoa = await prisma.person.findFirst({
    where: { id: personId, tenantId: ctx.tenantId, isInternal: true },
    select: { id: true, linkedUserId: true },
  });
  if (!pessoa) return { erro: "Pessoa não encontrada entre os colaboradores internos." };

  if (userId) {
    const [conta, dona] = await Promise.all([
      prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId }, select: { id: true } }),
      prisma.person.findFirst({ where: { linkedUserId: userId }, select: { id: true } }),
    ]);
    if (!conta) return { erro: "Conta não encontrada." };
    if (dona && dona.id !== personId) return { erro: "Esta conta já é de outra pessoa." };
  }

  try {
    await prisma.person.update({ where: { id: personId }, data: { linkedUserId: userId } });
  } catch (err) {
    console.error("[ligarContaDaPessoa]", err);
    return { erro: "Não deu para gravar. Tente de novo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: userId ? "person.link_user" : "person.unlink_user",
    entityType: "Person",
    entityId: personId,
    metadata: { userId: userId ?? pessoa.linkedUserId },
  });

  revalidatePath(`/pessoas/${personId}`);
  revalidatePath("/admin/usuarios");
  return { ok: true };
}
