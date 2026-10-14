"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import type { ManagementMode, BillingType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { lerEdicaoDoPlano, mudancasDoPlano } from "@/lib/planos/edicao";
import {
  CAMPOS_DO_SITE_PADRAO,
  CHAVE_PRECOS_NO_SITE,
  camposDaLinha,
  camposIguais,
  lerCamposDoSite,
  type CamposDoSite,
} from "@/lib/planos/site-regras";

export type PlanoState = { error: string } | null;

function toDecimal(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? "0").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function criarPlano(_prev: PlanoState, form: FormData): Promise<PlanoState> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return { error: "Sem permissão." };

  const name = (form.get("name") as string)?.trim();
  const managementMode = form.get("managementMode") as ManagementMode;
  const billingType = form.get("billingType") as BillingType;
  const basePrice = toDecimal(form.get("basePrice"));
  const pricePerUserRaw = form.get("pricePerUser");
  const pricePerUser = pricePerUserRaw ? toDecimal(pricePerUserRaw) : null;
  const setupFee = toDecimal(form.get("setupFee"));

  if (!name) return { error: "Nome do plano é obrigatório." };
  if (managementMode !== "MANAGED" && managementMode !== "SELF_SERVICE") return { error: "Modo de gestão inválido." };
  if (billingType !== "FLAT_MONTHLY" && billingType !== "PER_USER_MONTHLY") return { error: "Tipo de cobrança inválido." };
  if (billingType === "PER_USER_MONTHLY" && !pricePerUser) return { error: "Informe o valor por usuário." };

  const prisma = getPrisma();
  const plan = await prisma.subscriptionPlan.create({
    data: { name, managementMode, billingType, basePrice, pricePerUser, setupFee },
  });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "subscription_plan.create", entityType: "SubscriptionPlan", entityId: plan.id, metadata: { name } });

  refazerTelasDosPlanos();
  return null;
}

// null = plano libera todos os módulos do catálogo (sem restrição comercial) —
// TenantModule continua sendo o ajuste fino por tenant dentro do que o plano permite.
export async function atualizarModulosPlano(planId: string, moduleCodes: string[] | null): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return;

  const prisma = getPrisma();
  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { allowedModuleCodes: moduleCodes === null ? Prisma.DbNull : moduleCodes },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "subscription_plan.update_modules",
    entityType: "SubscriptionPlan",
    entityId: planId,
    metadata: { moduleCodes },
  });

  refazerTelasDosPlanos();
}

export async function alternarPlano(id: string, active: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return;

  const prisma = getPrisma();
  await prisma.subscriptionPlan.update({ where: { id }, data: { active } });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: active ? "subscription_plan.activate" : "subscription_plan.deactivate", entityType: "SubscriptionPlan", entityId: id });

  refazerTelasDosPlanos();
}

/**
 * A seção Planos do site e a tela de Planos leem o mesmo: depois de mexer num
 * plano, as duas (e a de Assinaturas, que mostra o nome do plano) se refazem.
 */
function refazerTelasDosPlanos() {
  revalidatePath("/admin/planos");
  revalidatePath("/admin/assinaturas");
  revalidatePath("/");
}

const SITE_SEM_TABELA =
  "O plano foi salvo, mas o que vai para o site não: falta a atualização do banco desta versão do Connect.";

/**
 * "Editar plano" (14/10/2026): nome, valor e implantação nas colunas do plano,
 * e — quando a janela mostrou os campos do site (`comSite`) — como ele aparece
 * na seção Planos do site, na tabela `planos_no_site`. O modo de gestão e o
 * tipo de cobrança não mudam (ver lib/planos/edicao). Só o Super Admin. Cada
 * parte vai para a Auditoria só quando muda.
 */
export async function editarPlano(_prev: PlanoState, form: FormData): Promise<PlanoState> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return { error: "Sem permissão." };

  const planId = String(form.get("planId") ?? "");
  if (!planId) return { error: "Plano inválido." };

  const prisma = getPrisma();
  const atual = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!atual) return { error: "Plano não encontrado." };

  const lido = lerEdicaoDoPlano(form, atual.billingType);
  if ("erro" in lido) return { error: lido.erro };

  let site: CamposDoSite | null = null;
  if (form.get("comSite") === "1") {
    const campos = lerCamposDoSite(form);
    if ("erro" in campos) return { error: campos.erro };
    site = campos.campos;
  }

  const mudancas = mudancasDoPlano(atual, lido.dados);
  if (Object.keys(mudancas).length > 0) {
    await prisma.subscriptionPlan.update({ where: { id: planId }, data: lido.dados });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "subscription_plan.update",
      entityType: "SubscriptionPlan",
      entityId: planId,
      metadata: Object.fromEntries(Object.entries(mudancas).map(([campo, m]) => [campo, `${m.de} → ${m.para}`])),
    });
  }

  if (site) {
    try {
      const guardada = await prisma.planoNoSite.findUnique({ where: { planId } });
      const antes = guardada ? camposDaLinha(guardada) : CAMPOS_DO_SITE_PADRAO;
      if (!camposIguais(antes, site)) {
        await prisma.planoNoSite.upsert({ where: { planId }, create: { planId, ...site }, update: site });
        await logAudit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "subscription_plan.site.update",
          entityType: "SubscriptionPlan",
          entityId: planId,
          metadata: { mostrarNoSite: site.mostrarNoSite, ordem: site.ordem, destacar: site.destacar },
        });
      }
    } catch (err) {
      refazerTelasDosPlanos();
      if (isPrismaMissingTableError(err)) return { error: SITE_SEM_TABELA };
      console.error("[planos] site", err);
      return { error: "O plano foi salvo, mas o que vai para o site não. Tente de novo." };
    }
  }

  refazerTelasDosPlanos();
  return null;
}

export type ResultadoDosPrecos = { ok: true } | { erro: string };

/**
 * O interruptor "Mostrar preços no site" — vale para todos os planos mostrados
 * lá. Decisão do Kauan (14/10/2026): começa desligado; ligar publica o valor e
 * a implantação de cada plano para quem abrir o site. Só o Super Admin.
 */
export async function definirPrecosNoSite(mostrar: boolean): Promise<ResultadoDosPrecos> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return { erro: "Sem permissão." };
  if (typeof mostrar !== "boolean") return { erro: "Pedido inválido." };

  const valor = mostrar ? "true" : "false";
  try {
    await getPrisma().configuracaoDoConnect.upsert({
      where: { chave: CHAVE_PRECOS_NO_SITE },
      create: { chave: CHAVE_PRECOS_NO_SITE, valor },
      update: { valor },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { erro: "Falta a atualização do banco desta versão do Connect." };
    console.error("[planos] preços no site", err);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: mostrar ? "site.prices.show" : "site.prices.hide",
    entityType: "ConfiguracaoDoConnect",
    entityId: CHAVE_PRECOS_NO_SITE,
  });

  refazerTelasDosPlanos();
  return { ok: true };
}
