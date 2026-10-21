"use server";

// O cadastro do cartão de crédito (lote D, 20/10) — o bloco "Cartões de
// crédito" de Contas a pagar. As regras moram em `cartao.ts`; a fatura é
// refeita na baixa, em `baixa/servidor.ts`.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { podeEditarOTipo } from "./acessoDaConta";
import { validarCartao } from "./cartao";
import { CARTAO_DE_CREDITO } from "./tiposDeConta";

/**
 * Cadastra ou edita o cartão. Mudar os dias vale para as compras de agora em
 * diante: a que já está numa fatura fica nela.
 */
export async function salvarCartao(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const acesso = await podeEditarOTipo("PAGAR");
  if (!acesso.ctx) return { error: acesso.erro ?? "Sem permissão." };
  const ctx = acesso.ctx;
  const tenantId = ctx.tenantId;
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const id = texto("id");
  const prisma = getPrisma();

  const v = validarCartao({ nome: texto("nome"), banco: texto("banco"), final: texto("final"), fechamento: texto("fechamento"), vencimento: texto("vencimento") });
  if (!v.ok) return { error: v.erro };
  const d = v.dados;
  const metadata = { banco: d.bankCode, cartao: d.accountNumber, fechamento: d.cardClosingDay, vencimento: d.cardDueDay };

  try {
    if (id) {
      const atual = await prisma.bankAccount.findFirst({ where: { id, tenantId, type: CARTAO_DE_CREDITO }, select: { id: true, companyId: true } });
      if (!atual) return { error: "Cartão não encontrado — atualize a tela." };
      const ativo = texto("ativo") !== "0";
      await prisma.bankAccount.update({ where: { id: atual.id }, data: { ...d, active: ativo } });
      await logAudit({
        tenantId,
        userId: ctx.userId,
        action: "finance.card_updated",
        entityType: "BankAccount",
        entityId: atual.id,
        metadata: { companyId: atual.companyId, ...metadata, ativo },
      });
    } else {
      const empresa = await prisma.company.findFirst({ where: { id: texto("companyId"), tenantId }, select: { id: true } });
      if (!empresa) return { error: "Escolha a empresa antes de cadastrar o cartão." };
      const criado = await prisma.bankAccount.create({ data: { tenantId, companyId: empresa.id, type: CARTAO_DE_CREDITO, ...d }, select: { id: true } });
      await logAudit({
        tenantId,
        userId: ctx.userId,
        action: "finance.card_created",
        entityType: "BankAccount",
        entityId: criado.id,
        metadata: { companyId: empresa.id, ...metadata },
      });
    }
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Esta empresa já tem um cartão com este banco e este final." };
    throw err;
  }

  for (const p of ["/pagar", "/lancamentos"]) revalidatePath(p);
  return { ok: true };
}
