"use server";

// Assuntos das solicitações do portal: o que o cliente escolhe, o setor que
// atende e o prazo de resposta prometido. Só administrador mexe — é a regra de
// roteamento de tudo o que o cliente pede.
//
// Não há excluir: solicitações antigas apontam para o assunto, então ele é
// desativado (some da lista do cliente e continua no histórico).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { validarAssunto } from "@/lib/solicitacoes/regras";

export type AssuntoState = { error: string } | null;

async function administrador() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role) || ctx.subscriptionReadOnly) return null;
  return ctx;
}

function campos(form: FormData) {
  const texto = (k: string) => String(form.get(k) ?? "");
  return { label: texto("label"), description: texto("description"), sectorCode: texto("sectorCode"), responseDays: texto("responseDays") };
}

async function setorAtivo(tenantId: string, code: string): Promise<boolean> {
  return (await getActiveSectors(tenantId)).some((s) => s.code === code);
}

export async function criarAssunto(_prev: AssuntoState, form: FormData): Promise<AssuntoState> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador cadastra assuntos." };
  const v = validarAssunto(campos(form));
  if (!v.ok) return { error: v.erro };
  if (!(await setorAtivo(ctx.tenantId, v.dados.sectorCode))) return { error: "Escolha um setor ativo." };

  const prisma = getPrisma();
  const ultimo = await prisma.serviceRequestSubject.aggregate({ where: { tenantId: ctx.tenantId }, _max: { order: true } });
  try {
    await prisma.serviceRequestSubject.create({
      data: { tenantId: ctx.tenantId, ...v.dados, order: (ultimo._max.order ?? -1) + 1 },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um assunto "${v.dados.label}".` };
    throw err;
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "solicitacao_assunto.create", entityType: "ServiceRequestSubject", metadata: { label: v.dados.label, setor: v.dados.sectorCode } });
  revalidatePath("/admin/assuntos");
  redirect("/admin/assuntos");
}

/**
 * Mudar o setor do assunto vale para as próximas solicitações: as abertas
 * continuam no setor em que estão (foram encaminhadas ou estão com alguém).
 * O mesmo para o prazo, que foi prometido ao cliente na abertura.
 */
export async function atualizarAssunto(_prev: AssuntoState, form: FormData): Promise<AssuntoState> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador edita assuntos." };
  const id = String(form.get("id") ?? "");
  const v = validarAssunto(campos(form));
  if (!v.ok) return { error: v.erro };
  if (!(await setorAtivo(ctx.tenantId, v.dados.sectorCode))) return { error: "Escolha um setor ativo." };

  const prisma = getPrisma();
  const existe = await prisma.serviceRequestSubject.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existe) return { error: "Assunto não encontrado." };
  try {
    await prisma.serviceRequestSubject.update({ where: { id }, data: v.dados });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um assunto "${v.dados.label}".` };
    throw err;
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "solicitacao_assunto.update", entityType: "ServiceRequestSubject", entityId: id, metadata: { label: v.dados.label, setor: v.dados.sectorCode } });
  revalidatePath("/admin/assuntos");
  redirect("/admin/assuntos");
}

/** Liga ou desliga o assunto na lista do cliente. Devolve `null` no sucesso (contrato do botão com confirmação). */
export async function alternarAssunto(id: string): Promise<{ error: string } | null> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador ativa ou desativa assuntos." };
  const prisma = getPrisma();
  const assunto = await prisma.serviceRequestSubject.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { active: true, label: true } });
  if (!assunto) return { error: "Assunto não encontrado." };
  if (assunto.active) {
    const ativos = await prisma.serviceRequestSubject.count({ where: { tenantId: ctx.tenantId, active: true } });
    if (ativos <= 1) return { error: "Deixe ao menos um assunto ativo — sem nenhum, o cliente não consegue pedir nada." };
  }
  await prisma.serviceRequestSubject.update({ where: { id }, data: { active: !assunto.active } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: assunto.active ? "solicitacao_assunto.deactivate" : "solicitacao_assunto.activate",
    entityType: "ServiceRequestSubject",
    entityId: id,
    metadata: { label: assunto.label },
  });
  revalidatePath("/admin/assuntos");
  return null;
}
