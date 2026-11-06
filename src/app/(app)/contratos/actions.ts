"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, podeExcluir, SO_ADMIN_EXCLUI } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { MODULO_CONTRATOS, contratoSchema } from "@/lib/financeiroInterno/contratos";

// Os Contratos e assinaturas do Financeiro (05/11/2026). Cadastrar, editar e
// cancelar é de quem coordena o setor; excluir, só do administrador — o dia a
// dia é cancelar, e o contrato fica no histórico.

const SO_COORDENACAO = "Só a coordenação do Financeiro cadastra e edita contratos.";

const dia = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);

export async function salvarContrato(id: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, MODULO_CONTRATOS, "gerir"))) return { error: SO_COORDENACAO };

  const v = (k: string) => {
    const x = form.get(k);
    return typeof x === "string" ? x : undefined;
  };
  const amountCents = centavosDeTexto(v("amount"));
  const lido = contratoSchema.safeParse({
    name: v("name") ?? "",
    supplier: v("supplier") ?? "",
    category: v("category"),
    amountCents: amountCents ?? Number.NaN,
    cycle: v("cycle"),
    startDate: v("startDate"),
    endDate: v("endDate"),
    renewalDate: v("renewalDate"),
    autoRenew: form.get("autoRenew") === "on" || form.get("autoRenew") === "true",
    ownerUserId: v("ownerUserId"),
    url: v("url"),
    notes: v("notes"),
  });
  if (!lido.success) return { error: lido.error.issues[0]?.message ?? "Confira os campos." };
  const d = lido.data;

  const prisma = getPrisma();
  let ownerName: string | null = null;
  if (d.ownerUserId) {
    const pessoa = await prisma.user.findFirst({ where: { id: d.ownerUserId, tenantId: ctx.tenantId }, select: { name: true } });
    if (!pessoa) return { error: "Responsável não encontrado neste escritório." };
    ownerName = pessoa.name;
  }
  const dados = {
    name: d.name,
    supplier: d.supplier,
    category: d.category,
    amountCents: d.amountCents,
    cycle: d.cycle,
    startDate: dia(d.startDate),
    endDate: dia(d.endDate),
    renewalDate: dia(d.renewalDate),
    autoRenew: d.autoRenew,
    ownerUserId: d.ownerUserId,
    ownerName,
    url: d.url,
    notes: d.notes,
  };
  const eraNovo = id === null;
  try {
    if (id) {
      const atual = await prisma.internalContract.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
      if (!atual) return { error: "Contrato não encontrado." };
      await prisma.internalContract.update({ where: { id }, data: dados });
    } else {
      id = (await prisma.internalContract.create({ data: { ...dados, tenantId: ctx.tenantId, status: "ATIVO", createdById: ctx.userId } })).id;
    }
  } catch (err) {
    console.error("[salvarContrato]", err);
    return { error: "Não foi possível salvar o contrato. Tente de novo." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: eraNovo ? "contrato_interno.create" : "contrato_interno.update", entityType: "InternalContract", entityId: id, metadata: { name: d.name } });
  revalidatePath("/contratos");
  return null;
}

export async function cancelarContrato(id: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, MODULO_CONTRATOS, "gerir"))) return { error: SO_COORDENACAO };
  const prisma = getPrisma();
  const atual = await prisma.internalContract.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { name: true, status: true } });
  if (!atual) return { error: "Contrato não encontrado." };
  if (atual.status === "CANCELADO") return null;
  await prisma.internalContract.update({ where: { id }, data: { status: "CANCELADO" } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "contrato_interno.cancel", entityType: "InternalContract", entityId: id, metadata: { name: atual.name } });
  revalidatePath("/contratos");
  return null;
}

export async function excluirContrato(id: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!podeExcluir(ctx)) return { error: SO_ADMIN_EXCLUI };
  if (!(await podeNoModulo(ctx, MODULO_CONTRATOS, "gerir"))) return { error: SO_COORDENACAO };
  const prisma = getPrisma();
  const atual = await prisma.internalContract.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { name: true } });
  if (!atual) return { error: "Contrato não encontrado." };
  await prisma.internalContract.delete({ where: { id } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "contrato_interno.delete", entityType: "InternalContract", entityId: id, metadata: { name: atual.name } });
  revalidatePath("/contratos");
  return null;
}
