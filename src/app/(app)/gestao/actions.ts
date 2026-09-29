"use server";

// Ações da Gestão (29/09): trocar o responsável de um item parado ou atrasado
// e ajustar os limites de alerta de cada setor.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { canManageSector, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { contextoDaGestao } from "@/lib/gestao/acesso";
import { podeVerSetor } from "@/lib/gestao/regras";
import { setorDoModulo } from "@/lib/modules";

export type AcaoDaGestao = { error: string } | { ok: true };

function revalidar() {
  revalidatePath("/gestao");
  revalidatePath("/gestao/alertas");
  revalidatePath("/gestao/coordenadores");
}

/**
 * Troca o responsável de um processo do Societário ou de um card. Pendência do
 * BPO e transferência têm tela própria para isso e não passam por aqui.
 * Quem pode: a coordenação do setor do item, ou administrador.
 */
export async function reatribuirItem(origem: "PROCESSO" | "CARD", id: string, userId: string): Promise<AcaoDaGestao> {
  const g = await contextoDaGestao();
  if (!g) return { error: "Sem acesso à Gestão." };
  const { ctx, recorte } = g;
  const prisma = getPrisma();

  let setor: string;
  if (origem === "PROCESSO") {
    const p = await prisma.process.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!p) return { error: "Processo não encontrado." };
    setor = (await setorDoModulo(ctx.tenantId, "societario_processos")) ?? "societario";
  } else {
    const c = await prisma.pipelineItem.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { pipeline: { select: { sectorCode: true } } } });
    if (!c) return { error: "Card não encontrado." };
    setor = c.pipeline.sectorCode;
  }
  if (!podeVerSetor(recorte, setor) || !(isFullWrite(ctx.role) || canManageSector(ctx, setor))) {
    return { error: "Só a coordenação do setor troca o responsável." };
  }

  const pessoa = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, active: true, sectors: { some: { sectorCode: setor } } },
    select: { id: true, name: true },
  });
  if (!pessoa) return { error: "Essa pessoa não é do setor." };

  if (origem === "PROCESSO") {
    await prisma.process.update({ where: { id }, data: { ownerUserId: pessoa.id } });
  } else {
    await prisma.$transaction([
      prisma.pipelineItemAssignee.deleteMany({ where: { pipelineItemId: id } }),
      prisma.pipelineItemAssignee.create({ data: { pipelineItemId: id, userId: pessoa.id } }),
    ]);
  }
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "gestao.reatribuir",
    entityType: origem === "PROCESSO" ? "Process" : "PipelineItem",
    entityId: id,
    metadata: { para: pessoa.name },
  });
  revalidar();
  return { ok: true };
}

/** Os limites de alerta de um setor. Vazio volta ao padrão. */
export async function salvarLimites(sectorCode: string, diasParado: string, diasAvisoPrazo: string): Promise<AcaoDaGestao> {
  const g = await contextoDaGestao();
  if (!g) return { error: "Sem acesso à Gestão." };
  const { ctx, recorte } = g;
  if (!podeVerSetor(recorte, sectorCode) || !(isFullWrite(ctx.role) || canManageSector(ctx, sectorCode))) {
    return { error: "Só a coordenação do setor ajusta os limites dele." };
  }
  const ler = (v: string, max: number): number | null | "erro" => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 1 && n <= max ? n : "erro";
  };
  const parado = ler(diasParado, 365);
  const aviso = ler(diasAvisoPrazo, 90);
  if (parado === "erro") return { error: "Dias para parado: um número inteiro de 1 a 365." };
  if (aviso === "erro") return { error: "Aviso de prazo: um número inteiro de 1 a 90." };

  const r = await getPrisma().sector.updateMany({
    where: { tenantId: ctx.tenantId, code: sectorCode },
    data: { alertStalledDays: parado, alertDueSoonDays: aviso },
  });
  if (r.count === 0) return { error: "Setor não encontrado." };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "gestao.limites",
    entityType: "Sector",
    entityId: sectorCode,
    metadata: { diasParado: parado, diasAvisoPrazo: aviso },
  });
  revalidar();
  return { ok: true };
}
