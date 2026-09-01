"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canWriteEntity } from "@/lib/auth/policy";
import { pick } from "@/lib/forms";
import { cnpjRoot } from "@/lib/clientGroups";
import { logAudit } from "@/lib/audit";

export type ClienteState = { error: string } | null;

function clienteData(form: FormData) {
  return {
    name: (form.get("name") as string)?.trim().slice(0, 180),
    // Raiz sem máscara e só quando tem 8 dígitos: raiz errada agrupa empresas
    // que não são do mesmo cliente, o que é pior do que não agrupar.
    cnpjRoot: (() => {
      const bruto = pick(form, "cnpjRoot");
      if (!bruto) return null;
      const digitos = bruto.replace(/\D/g, "");
      return digitos.length === 8 ? digitos : cnpjRoot(bruto);
    })(),
    active: form.get("active") === "on",
  };
}

function validar(data: ReturnType<typeof clienteData>): string | null {
  if (!data.name) return "Nome do cliente é obrigatório.";
  const bruto = data.cnpjRoot;
  if (bruto !== null && bruto.length !== 8) {
    return "Raiz do CNPJ precisa ter 8 dígitos (os 8 primeiros do CNPJ).";
  }
  return null;
}

export async function criarCliente(_prev: ClienteState, form: FormData): Promise<ClienteState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para criar clientes." };

  const data = clienteData(form);
  const erro = validar(data);
  if (erro) return { error: erro };

  const prisma = getPrisma();
  let id: string;
  try {
    const cliente = await prisma.clientGroup.create({ data: { tenantId: ctx.tenantId, ...data } });
    id = cliente.id;
  } catch (err) {
    console.error("[criarCliente]", err);
    return { error: "Erro ao criar cliente. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "clientGroup.create",
    entityType: "ClientGroup",
    entityId: id,
    metadata: { name: data.name },
  });

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function atualizarCliente(_prev: ClienteState, form: FormData): Promise<ClienteState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para editar clientes." };

  const id = form.get("id") as string;
  const data = clienteData(form);
  const erro = validar(data);
  if (erro) return { error: erro };

  const prisma = getPrisma();
  // Escopo por tenant na consulta, não no update: `id` vem do formulário.
  const existing = await prisma.clientGroup.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!existing) return { error: "Cliente não encontrado." };

  try {
    await prisma.clientGroup.update({ where: { id }, data });
  } catch (err) {
    console.error("[atualizarCliente]", err);
    return { error: "Erro ao atualizar cliente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "clientGroup.update",
    entityType: "ClientGroup",
    entityId: id,
    metadata: { name: data.name },
  });

  revalidatePath("/clientes");
  redirect("/clientes");
}

/**
 * Desativa em vez de excluir.
 *
 * Empresa não pode ficar sem cliente — o campo é obrigatório no cadastro desde
 * 01/09 — então apagar um cliente que tem empresas deixaria todas elas órfãs,
 * que é exatamente o estado que o `ClientGroup` veio eliminar. Cliente inativo
 * some do seletor de novas empresas e continua respondendo pelas que já tem.
 */
export async function alternarAtivoCliente(id: string): Promise<ClienteState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx)) return { error: "Sem permissão." };

  const prisma = getPrisma();
  const existing = await prisma.clientGroup.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, active: true, name: true },
  });
  if (!existing) return { error: "Cliente não encontrado." };

  await prisma.clientGroup.update({ where: { id }, data: { active: !existing.active } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: existing.active ? "clientGroup.deactivate" : "clientGroup.activate",
    entityType: "ClientGroup",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath("/clientes");
  return null;
}
