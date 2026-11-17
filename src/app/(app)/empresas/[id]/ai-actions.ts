"use server";

import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { ZodError } from "zod";
import { gerarEstruturado, isAiConfigured } from "@/lib/ai";
import { formatCalendarDate, formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import {
  casarResumo,
  ESQUEMA_DO_RESUMO,
  linhasDoResumo,
  PROMPT_DO_RESUMO,
  respostaDoResumoSchema,
  type EventoDoResumo,
  type ResumoEmBlocos,
} from "@/lib/resumoDaEmpresa";

// O resumo em blocos e a hora em que saiu (17/11/2026, melhoria-723): era
// `{ summary }`, o texto corrido da IA. Nada é gravado: o "gerado em" é o
// momento desta resposta.
export type AiSummaryState = { error: string } | { resumo: ResumoEmBlocos; geradoEm: string } | null;

const DAY_MS = 24 * 60 * 60 * 1000;

/** O que a pessoa lê quando a IA responde fora do combinado; o motivo fica no log. */
const NAO_FOI_POSSIVEL = "Não foi possível gerar o resumo. Tente de novo.";

export async function gerarResumoEmpresa(companyId: string): Promise<AiSummaryState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!(await isAiConfigured(ctx.tenantId))) {
    return { error: "IA não configurada. Cadastre uma chave em Integrações → Inteligência artificial." };
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
        id: true,
        number: true,
        subject: true,
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
        id: true,
        number: true,
        pipelineId: true,
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
      select: { id: true, title: true, status: true, publishedAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // O setor, a situação e a prioridade vão com o nome da tela ("BPO", "nova",
  // "média"), e não com o código do banco (16/11/2026, bug-708): a IA repetia
  // "NEW em bpo; prioridade MEDIUM" no texto do resumo.
  const { labels, colors } = await getSectorMaps(ctx.tenantId);
  const rotulo = (codigo: string) => sectorLabel(labels, codigo);

  // Cada evento vira uma linha com identificador ("t1", "r2"…), e a IA só
  // devolve o identificador (17/11/2026, melhoria-723): os selos e o link de
  // cada item saem daqui, do registro. Ver src/lib/resumoDaEmpresa.ts.
  const eventos: EventoDoResumo[] = [
    ...meetings.map((m): EventoDoResumo => ({ tipo: "reuniao", data: formatInstantDate(m.startAt), titulo: m.title, cliente: m.clientName, setor: m.sectorCode })),
    ...handoffs.map((h): EventoDoResumo => ({
      tipo: "transferencia",
      id: h.id,
      number: h.number,
      data: formatInstantDate(h.createdAt),
      de: h.fromSector,
      partes: h.sectors,
      prioridade: h.priority,
      // O assunto, desde 10/11/2026; as novas não escrevem mais `message`.
      resumo: h.subject ?? h.message,
    })),
    ...items.map((i): EventoDoResumo => ({
      tipo: "quadro",
      id: i.id,
      number: i.number,
      pipelineId: i.pipelineId,
      data: formatInstantDate(i.updatedAt),
      quadro: i.pipeline.name,
      setor: i.pipeline.sectorCode,
      etapa: i.stage.name,
      vence: i.dueDate ? formatCalendarDate(i.dueDate) : null,
      descricao: i.description,
    })),
    ...clientDocs.map((d): EventoDoResumo => ({ tipo: "envio", id: d.id, data: formatInstantDate(d.createdAt), titulo: d.title, publicado: d.status === "PUBLISHED" })),
  ];
  const lines = linhasDoResumo(eventos, rotulo);

  if (lines.length === 0) {
    return { error: "Nenhum evento registrado nos últimos 90 dias para esta empresa." };
  }

  const agora = new Date();
  let resumo: ResumoEmBlocos;
  try {
    const { valor } = await gerarEstruturado({
      tenantId: ctx.tenantId,
      agentCode: "resumo_empresa",
      sistema: PROMPT_DO_RESUMO,
      // O dia de hoje vai junto para a IA saber o que já venceu.
      texto: `Empresa: ${company.tradeName || company.name}\nHoje: ${formatInstantDate(agora)}\n\nEventos dos últimos 90 dias:\n${lines.map((l) => l.linha).join("\n")}`,
      nome: "resumo_da_empresa",
      schema: ESQUEMA_DO_RESUMO,
      maxTokens: 3000,
      estrito: true,
      timeoutMs: 60000,
      esforco: "low",
      contexto: { userId: ctx.userId, entityType: "empresa", entityId: companyId },
    });
    resumo = casarResumo(respostaDoResumoSchema.parse(valor), lines, (codigo) => ({
      rotulo: rotulo(codigo),
      cor: colors[codigo] ?? "#586577",
    }));
  } catch (err) {
    // Resposta fora do formato ou do esquema: a pessoa vê o erro de sempre, e
    // o texto técnico (que pode citar um trecho da resposta) não vai à tela.
    if (err instanceof SyntaxError || err instanceof ZodError) {
      console.error("[gerarResumoEmpresa] resposta da IA fora do esquema esperado");
      return { error: NAO_FOI_POSSIVEL };
    }
    console.error("[gerarResumoEmpresa]", err);
    return { error: err instanceof Error ? err.message : NAO_FOI_POSSIVEL };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "ai.companySummary",
    entityType: "Company",
    entityId: companyId,
    metadata: { events: lines.length },
  });

  return { resumo, geradoEm: formatInstantDateTime(new Date(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) };
}
