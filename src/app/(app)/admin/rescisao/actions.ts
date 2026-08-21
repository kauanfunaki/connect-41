"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { logAudit } from "@/lib/audit";
import { clampTolerancia, clampMediaMeses } from "@/lib/rescisao/config";
import { InsalubridadeGrau, InsalubridadeBase, MediaBase } from "@/generated/prisma/enums";
import type { RescisaoConfigState } from "@/components/rescisao/RescisaoConfigForm";

function pickEnum<T extends Record<string, string>>(form: FormData, key: string, e: T): T[keyof T] | null {
  const raw = ((form.get(key) as string) ?? "").trim();
  return raw && (Object.values(e) as string[]).includes(raw) ? (raw as T[keyof T]) : null;
}

/** Campos comuns aos dois níveis. Um form sem o campo devolve null = herda. */
function parseConfig(form: FormData) {
  const mediaMesesRaw = ((form.get("mediaMeses") as string) ?? "").trim();
  const toleranciaRaw = ((form.get("toleranciaPct") as string) ?? "").trim();

  return {
    insalubridadeGrau: pickEnum(form, "insalubridadeGrau", InsalubridadeGrau),
    insalubridadeBase: pickEnum(form, "insalubridadeBase", InsalubridadeBase),
    periculosidadeAplica: form.get("periculosidadeAplica") === "true",
    periculosidadeIntegral: form.get("periculosidadeIntegral") === "true",
    mediaMeses: mediaMesesRaw ? clampMediaMeses(Number(mediaMesesRaw)) : null,
    mediaBaseFerias: pickEnum(form, "mediaBaseFerias", MediaBase),
    mediaBaseDecimoTerceiro: pickEnum(form, "mediaBaseDecimoTerceiro", MediaBase),
    tercoApresentadoSeparado: form.get("tercoApresentadoSeparado") === "true",
    // getAll: o form manda um value por checkbox marcado.
    verbasDesabilitadas: form.getAll("verbasDesabilitadas").filter((v): v is string => typeof v === "string"),
    toleranciaPct: toleranciaRaw ? clampTolerancia(Number(toleranciaRaw)) : null,
    cctNome: ((form.get("cctNome") as string) ?? "").trim() || null,
    cctObservacoes: ((form.get("cctObservacoes") as string) ?? "").trim() || null,
  };
}

// Padrão do escritório — gate de admin: muda o cálculo de TODAS as empresas.
export async function salvarConfigTenant(
  _prev: RescisaoConfigState,
  form: FormData
): Promise<RescisaoConfigState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para editar o padrão do escritório." };

  const dados = parseConfig(form);
  const prisma = getPrisma();

  try {
    await prisma.tenantRescisaoConfig.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        insalubridadeGrau: dados.insalubridadeGrau ?? "NENHUM",
        insalubridadeBase: dados.insalubridadeBase ?? "SALARIO_MINIMO",
        periculosidadeAplica: dados.periculosidadeAplica,
        periculosidadeIntegral: dados.periculosidadeIntegral,
        mediaMeses: dados.mediaMeses ?? 12,
        mediaBaseFerias: dados.mediaBaseFerias ?? "PERIODO_AQUISITIVO",
        mediaBaseDecimoTerceiro: dados.mediaBaseDecimoTerceiro ?? "ANO_CIVIL",
        tercoApresentadoSeparado: dados.tercoApresentadoSeparado,
        verbasDesabilitadas: dados.verbasDesabilitadas,
        toleranciaPct: dados.toleranciaPct ?? 1,
        cctNome: dados.cctNome,
        cctObservacoes: dados.cctObservacoes,
      },
      update: {
        insalubridadeGrau: dados.insalubridadeGrau ?? "NENHUM",
        insalubridadeBase: dados.insalubridadeBase ?? "SALARIO_MINIMO",
        periculosidadeAplica: dados.periculosidadeAplica,
        periculosidadeIntegral: dados.periculosidadeIntegral,
        mediaMeses: dados.mediaMeses ?? 12,
        mediaBaseFerias: dados.mediaBaseFerias ?? "PERIODO_AQUISITIVO",
        mediaBaseDecimoTerceiro: dados.mediaBaseDecimoTerceiro ?? "ANO_CIVIL",
        tercoApresentadoSeparado: dados.tercoApresentadoSeparado,
        verbasDesabilitadas: dados.verbasDesabilitadas,
        toleranciaPct: dados.toleranciaPct ?? 1,
        cctNome: dados.cctNome,
        cctObservacoes: dados.cctObservacoes,
      },
    });
  } catch (err) {
    console.error("[salvarConfigTenant]", err);
    return { error: "Erro ao salvar a configuração." };
  }

  // Parâmetro que muda número precisa de rastro.
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "rescisao.config.tenant.update",
    entityType: "TenantRescisaoConfig",
    metadata: { ...dados },
  });

  revalidatePath("/admin/rescisao");
  return null;
}

// Override por empresa.
export async function salvarConfigEmpresa(
  companyId: string,
  _prev: RescisaoConfigState,
  form: FormData
): Promise<RescisaoConfigState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar a configuração desta empresa." };

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) return { error: "Empresa não encontrada ou fora do seu escopo." };

  const dados = parseConfig(form);

  try {
    await prisma.companyRescisaoConfig.upsert({
      where: { companyId },
      create: { tenantId: ctx.tenantId, companyId, ...dados },
      update: dados,
    });
  } catch (err) {
    console.error("[salvarConfigEmpresa]", err);
    return { error: "Erro ao salvar a configuração." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "rescisao.config.empresa.update",
    entityType: "CompanyRescisaoConfig",
    entityId: companyId,
    metadata: { company: company.name, ...dados },
  });

  revalidatePath(`/empresas/${companyId}/rescisao-config`);
  return null;
}
