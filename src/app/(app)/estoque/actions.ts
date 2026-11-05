"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, podeExcluir, SO_ADMIN_EXCLUI } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { MODULO_ESTOQUE, MOVIMENTOS, aplicarMovimento, itemSchema, type TipoDeMovimento } from "@/lib/financeiroInterno/estoque";

// O Estoque do Financeiro (05/11/2026). Cadastrar e editar é de quem coordena o
// setor; movimentar e conferir, de quem age nele; excluir, só do administrador
// (regra de 13/10/2026) — no dia a dia, o item se "dá baixa", e o histórico fica.

const SEM_PERMISSAO = "Você não tem permissão no Estoque.";

function campos(form: FormData) {
  const v = (k: string) => {
    const x = form.get(k);
    return typeof x === "string" ? x : undefined;
  };
  return {
    kind: v("kind"),
    name: v("name") ?? "",
    category: v("category") ?? "",
    assetTag: v("assetTag"),
    serialNumber: v("serialNumber"),
    location: v("location"),
    unit: v("unit"),
    quantity: v("quantity") || undefined,
    minQuantity: v("minQuantity") ?? "",
    purchaseDate: v("purchaseDate"),
    supplier: v("supplier"),
    notes: v("notes"),
  };
}

export async function salvarItemDoEstoque(id: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, MODULO_ESTOQUE, "gerir"))) return { error: "Só a coordenação do Financeiro cadastra e edita itens." };

  const eraNovo = id === null;
  const lido = itemSchema.safeParse(campos(form));
  if (!lido.success) return { error: lido.error.issues[0]?.message ?? "Confira os campos." };
  const d = lido.data;
  const valor = form.get("purchaseValue");
  const purchaseValueCents = typeof valor === "string" && valor.trim() ? centavosDeTexto(valor) : null;
  if (typeof valor === "string" && valor.trim() && purchaseValueCents === null) return { error: "Valor de compra inválido." };

  const prisma = getPrisma();
  const dados = {
    kind: d.kind,
    name: d.name,
    category: d.category,
    assetTag: d.assetTag,
    serialNumber: d.serialNumber,
    location: d.location,
    unit: d.kind === "material" ? d.unit : "un",
    minQuantity: d.minQuantity,
    purchaseDate: d.purchaseDate ? new Date(`${d.purchaseDate}T00:00:00Z`) : null,
    purchaseValueCents,
    supplier: d.supplier,
    notes: d.notes,
  };
  try {
    if (d.assetTag) {
      const repetido = await prisma.inventoryItem.findFirst({ where: { tenantId: ctx.tenantId, assetTag: d.assetTag, ...(id ? { id: { not: id } } : {}) }, select: { name: true } });
      if (repetido) return { error: `O patrimônio ${d.assetTag} já é de “${repetido.name}”.` };
    }
    if (id) {
      const atual = await prisma.inventoryItem.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, kind: true } });
      if (!atual) return { error: "Item não encontrado." };
      if (atual.kind !== d.kind) return { error: "O tipo do item (patrimônio ou material) não muda depois de cadastrado." };
      await prisma.inventoryItem.update({ where: { id }, data: dados });
    } else {
      // Patrimônio nasce com 1; material, com a quantidade informada (a primeira entrada).
      const quantidade = d.kind === "patrimonio" ? 1 : (d.quantity ?? 0);
      const quem = (await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }))?.name ?? "—";
      await prisma.$transaction(async (tx) => {
        const novo = await tx.inventoryItem.create({ data: { ...dados, tenantId: ctx.tenantId!, quantity: quantidade, status: "DISPONIVEL", createdById: ctx.userId! } });
        await tx.inventoryMovement.create({
          data: { tenantId: ctx.tenantId!, itemId: novo.id, type: "ENTRADA", quantity: quantidade, location: d.location, note: "Cadastro do item", createdById: ctx.userId!, createdByName: quem },
        });
        id = novo.id;
      });
    }
  } catch (err) {
    console.error("[salvarItemDoEstoque]", err);
    return { error: "Não foi possível salvar o item. Tente de novo." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: eraNovo ? "estoque.item.create" : "estoque.item.update", entityType: "InventoryItem", entityId: id ?? undefined, metadata: { name: d.name } });
  revalidatePath("/estoque");
  return null;
}

export async function movimentarItemDoEstoque(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, MODULO_ESTOQUE, "agir"))) return { error: SEM_PERMISSAO };

  const tipo = form.get("tipo");
  if (typeof tipo !== "string" || !(tipo in MOVIMENTOS)) return { error: "Escolha o que aconteceu com o item." };
  const texto = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const quantidade = texto("quantidade") === null ? undefined : Number(texto("quantidade"));
  const holderUserId = texto("holderUserId");

  const prisma = getPrisma();
  const item = await prisma.inventoryItem.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, name: true, kind: true, status: true, quantity: true, holderUserId: true, holderName: true, location: true },
  });
  if (!item) return { error: "Item não encontrado." };

  // Pessoa do Connect: o nome vem do cadastro (e tem de ser deste escritório).
  let holderName = texto("holderName");
  if (holderUserId) {
    const pessoa = await prisma.user.findFirst({ where: { id: holderUserId, tenantId: ctx.tenantId }, select: { name: true } });
    if (!pessoa) return { error: "Pessoa não encontrada neste escritório." };
    holderName = pessoa.name;
  }

  const r = aplicarMovimento(item, { tipo: tipo as TipoDeMovimento, quantidade, holderUserId, holderName, location: texto("location") });
  if ("erro" in r) return { error: r.erro };

  const quem = (await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }))?.name ?? "—";
  try {
    await prisma.$transaction([
      prisma.inventoryItem.update({
        where: { id },
        data: {
          status: r.item.status,
          quantity: r.item.quantity,
          holderUserId: r.item.holderUserId,
          holderName: r.item.holderName,
          location: r.item.location,
          ...(tipo === "CONFERENCIA" ? { lastCheckedAt: new Date() } : {}),
        },
      }),
      prisma.inventoryMovement.create({
        data: {
          tenantId: ctx.tenantId,
          itemId: id,
          type: tipo,
          quantity: quantidade ?? 0,
          holderUserId: r.item.holderUserId,
          holderName: r.item.holderName,
          location: r.item.location,
          note: texto("note"),
          createdById: ctx.userId,
          createdByName: quem,
        },
      }),
    ]);
  } catch (err) {
    console.error("[movimentarItemDoEstoque]", err);
    return { error: "Não foi possível registrar. Tente de novo." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "estoque.item.movimento", entityType: "InventoryItem", entityId: id, metadata: { name: item.name, movimento: tipo } });
  revalidatePath("/estoque");
  return null;
}

export async function excluirItemDoEstoque(id: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!podeExcluir(ctx)) return { error: SO_ADMIN_EXCLUI };
  if (!(await podeNoModulo(ctx, MODULO_ESTOQUE, "gerir"))) return { error: SEM_PERMISSAO };

  const prisma = getPrisma();
  const item = await prisma.inventoryItem.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, name: true } });
  if (!item) return { error: "Item não encontrado." };
  try {
    await prisma.inventoryItem.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirItemDoEstoque]", err);
    return { error: "Não foi possível excluir o item." };
  }
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "estoque.item.delete", entityType: "InventoryItem", entityId: id, metadata: { name: item.name } });
  revalidatePath("/estoque");
  // A página do item deixou de existir: volta para a lista.
  redirect("/estoque");
}
