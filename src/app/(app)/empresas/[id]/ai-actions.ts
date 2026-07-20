"use server";

import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { summarizeCompanyHistory, isAiConfigured } from "@/lib/ai";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { logAudit } from "@/lib/audit";

export type AiSummaryState = { error: string } | { summary: string } | null;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function gerarResumoEmpresa(companyId: string): Promise<AiSummaryState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isAiConfigured()) {
    return { error: "IA não configurada neste ambiente (ANTHROPIC_API_KEY ausente)." };
  }

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true, tradeName: true },
  });
  if (!company) return { error: "Empresa não encontrada." };

  const since = new Date(Date.now() - 90 * DAY_MS);

  const [meetings, handoffs, items, clientDocs] = await Promise.all([
    prisma.meeting.findMany({
      where: { tenantId: ctx.tenantId, companyId, startAt: { gte: since } },
      select: { title: true, startAt: true, clientName: true, sectorCode: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.handoff.findMany({
      where: { tenantId: ctx.tenantId, entityType: "COMPANY", entityId: companyId, createdAt: { gte: since } },
      select: {
        message: true,
        description: true,
        priority: true,
        createdAt: true,
        fromSector: true,
        sectors: { select: { sectorCode: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pipelineItem.findMany({
      where: { tenantId: ctx.tenantId, entityType: "COMPANY", entityId: companyId, updatedAt: { gte: since } },
      select: {
        description: true,
        dueDate: true,
        updatedAt: true,
        stage: { select: { name: true } },
        pipeline: { select: { name: true, sectorCode: true } },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.clientDocument.findMany({
      where: { tenantId: ctx.tenantId, companyId, createdAt: { gte: since } },
      select: { title: true, status: true, publishedAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const lines: string[] = [];
  for (const m of meetings) {
    lines.push(`[Reunião] ${formatInstantDate(m.startAt)} — ${m.title}${m.clientName ? ` (com ${m.clientName})` : ""}${m.sectorCode ? ` · setor ${m.sectorCode}` : ""}`);
  }
  for (const h of handoffs) {
    const dest = h.sectors.map((s) => `${s.sectorCode}:${s.status}`).join(", ");
    lines.push(`[Transferência] ${formatInstantDate(h.createdAt)} — de ${h.fromSector} para ${dest} · prioridade ${h.priority}${h.message ? ` · "${h.message.slice(0, 160)}"` : ""}`);
  }
  for (const i of items) {
    lines.push(`[Kanban ${i.pipeline.name} · ${i.pipeline.sectorCode}] etapa "${i.stage.name}"${i.dueDate ? ` · vence ${formatCalendarDate(i.dueDate)}` : ""}${i.description ? ` · ${i.description.slice(0, 160)}` : ""}`);
  }
  for (const d of clientDocs) {
    lines.push(`[Documento] ${formatInstantDate(d.createdAt)} — "${d.title}" · ${d.status === "PUBLISHED" ? "publicado" : "rascunho"}`);
  }

  if (lines.length === 0) {
    return { error: "Nenhum evento registrado nos últimos 90 dias para esta empresa." };
  }

  let summary: string;
  try {
    summary = await summarizeCompanyHistory({
      companyName: company.tradeName || company.name,
      digest: lines.join("\n"),
    });
  } catch (err) {
    console.error("[gerarResumoEmpresa]", err);
    return { error: err instanceof Error ? err.message : "Erro ao gerar o resumo com IA." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "ai.companySummary",
    entityType: "Company",
    entityId: companyId,
    metadata: { events: lines.length },
  });

  return { summary };
}
