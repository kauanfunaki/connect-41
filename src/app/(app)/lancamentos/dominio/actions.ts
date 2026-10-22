"use server";

// O de-para da Domínio de uma empresa (fila do BPO, 21/10): o código
// Matriz/Filial e as contas contábeis das categorias, das contas bancárias e,
// quando o Contábil quiser, dos fornecedores e clientes.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { contaReduzidaValida } from "@/lib/financeiro/dominio/planilha";
import type { TipoDoDePara } from "@/lib/financeiro/dominio/lancamentos";

const MODULE = "bpo_lancamentos";

/** O prefixo de cada campo do formulário: `cat:<id>`, `banco:<id>`, `cp:<id>`. */
const PREFIXOS: Record<string, TipoDoDePara> = { "cat:": "CATEGORIA", "banco:": "CONTA_BANCARIA", "cp:": "CONTRAPARTE" };

export type Resultado = { error: string } | { ok: true; gravadas: number; apagadas: number };

/**
 * Grava o de-para que a tela mostrou. Campo vazio tira a conta do de-para;
 * conta que não é código reduzido (só dígitos) é recusa, com o nome de onde
 * está. O id de cada cadastro é conferido contra a empresa.
 */
export async function salvarDeParaDaDominio(formData: FormData): Promise<Resultado> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canActOnSector(ctx, setor)) return { error: "Sem permissão." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "Módulo não habilitado." };
  const tenantId = ctx.tenantId;
  const prisma = getPrisma();

  const companyId = String(formData.get("companyId") ?? "");
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!empresa) return { error: "Empresa não encontrada." };
  // Uma empresa por vez: com o foco ligado, só a base em foco.
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return { error: foraDoFoco };

  const filial = String(formData.get("codigoFilial") ?? "").trim();
  if (filial !== "" && !/^\d{1,20}$/.test(filial)) return { error: "O código Matriz/Filial da Domínio é só número (ex.: 11301)." };

  const pedidos: { kind: TipoDoDePara; refId: string; conta: string | null; rotulo: string }[] = [];
  for (const [chave, valor] of formData.entries()) {
    const prefixo = Object.keys(PREFIXOS).find((p) => chave.startsWith(p));
    if (!prefixo || typeof valor !== "string") continue;
    const refId = chave.slice(prefixo.length);
    const texto = valor.trim();
    const conta = texto === "" ? null : contaReduzidaValida(texto);
    const rotulo = String(formData.get(`rotulo:${chave}`) ?? "uma linha");
    if (texto !== "" && !conta) return { error: `${rotulo}: use o código reduzido da conta na Domínio, só números (ex.: 341).` };
    pedidos.push({ kind: PREFIXOS[prefixo]!, refId, conta, rotulo });
  }
  if (pedidos.length > 2000) return { error: "Linhas demais de uma vez." };

  // Só cadastros desta empresa.
  const ids = (k: TipoDoDePara) => pedidos.filter((p) => p.kind === k).map((p) => p.refId);
  const [categorias, contas, contrapartes] = await Promise.all([
    prisma.financeCategory.findMany({ where: { ...ondeDaEmpresa(tenantId, companyId, { apenasAtivas: false, incluirOcultas: true }), id: { in: ids("CATEGORIA") } }, select: { id: true } }),
    prisma.bankAccount.findMany({ where: { tenantId, companyId, id: { in: ids("CONTA_BANCARIA") } }, select: { id: true } }),
    prisma.financeCounterparty.findMany({ where: { tenantId, companyId, id: { in: ids("CONTRAPARTE") } }, select: { id: true } }),
  ]);
  const validos: Record<TipoDoDePara, Set<string>> = {
    CATEGORIA: new Set(categorias.map((c) => c.id)),
    CONTA_BANCARIA: new Set(contas.map((c) => c.id)),
    CONTRAPARTE: new Set(contrapartes.map((c) => c.id)),
  };
  const fora = pedidos.find((p) => !validos[p.kind].has(p.refId));
  if (fora) return { error: `${fora.rotulo}: não é desta empresa — atualize a tela.` };

  let gravadas = 0;
  let apagadas = 0;
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: companyId }, data: { dominioBranchCode: filial || null } });
    for (const p of pedidos) {
      const chave = { companyId_kind_refId: { companyId, kind: p.kind, refId: p.refId } };
      if (p.conta) {
        await tx.dominioAccountMap.upsert({
          where: chave,
          create: { tenantId, companyId, kind: p.kind, refId: p.refId, account: p.conta, updatedById: ctx.userId || null },
          update: { account: p.conta, updatedById: ctx.userId || null },
        });
        gravadas++;
      } else {
        apagadas += (await tx.dominioAccountMap.deleteMany({ where: { tenantId, companyId, kind: p.kind, refId: p.refId } })).count;
      }
    }
  });

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "financeiro.dominio.depara_saved",
    entityType: "Company",
    entityId: companyId,
    metadata: { codigoFilial: filial || null, gravadas, apagadas },
  });
  revalidatePath("/lancamentos/dominio");
  return { ok: true, gravadas, apagadas };
}
