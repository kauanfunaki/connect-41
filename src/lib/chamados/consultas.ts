import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { podeAbrir, podeVerInterno, podeVer } from "./acesso";
import type { Contexto } from "./contexto";
import { categoriaSchema, dadosRascunhoSchema, parecerSchema, tituloDaDescricao, PRIORIDADES, STATUS, fechado } from "./regras";

export const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
export async function temAcessoAoModulo(c: Contexto) {
  return c.config.enabled && (podeAbrir(c.ctx, c.config) || podeVerInterno(c.ctx, c.config) || await getPrisma().helpdeskTicket.count({ where: whereVisivel(c) }) > 0);
}
export function whereVisivel({ ctx, config }: Contexto): Prisma.HelpdeskTicketWhereInput {
  if (!config.enabled) return { tenantId: ctx.tenantId, id: { in: [] } };
  if (podeVerInterno(ctx, config)) return { tenantId: ctx.tenantId };
  return { tenantId: ctx.tenantId, OR: [
    { createdById: ctx.userId },
    ...(ctx.role === "SECTOR_ADMIN" ? [{ requesterSectorCode: { in: ctx.sectors } }] : []),
  ] };
}
export async function categorias(c: Contexto, todas = false) {
  return getPrisma().helpdeskCategory.findMany({ where: { tenantId: c.ctx.tenantId, ...(todas ? {} : { active: true }) }, orderBy: { name: "asc" } });
}
export async function categoriaAtual(tenantId: string, id: string) {
  const row = await getPrisma().helpdeskCategory.findFirst({ where: { tenantId, id } });
  if (!row) throw new Error("Categoria não encontrada.");
  return { row, categoria: categoriaSchema.parse(row) };
}
export async function rascunho(c: Contexto, id: string) {
  const d = await getPrisma().helpdeskDraft.findFirst({ where: { id, tenantId: c.ctx.tenantId, createdById: c.ctx.userId }, include: { ticket: { select: { id: true } }, messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, attachments: { where: { ticketId: null }, orderBy: { createdAt: "asc" } } } });
  if (!d) throw new Error("Rascunho não encontrado.");
  return d;
}
export async function lista(c: Contexto, filtros: Record<string, string | undefined>) {
  const page = Math.min(100000, Math.max(1, Number.parseInt(filtros.pagina ?? "1", 10) || 1));
  const idsCategoria = new Set(filtros.categoria ? [filtros.categoria] : []);
  if (filtros.categoria) {
    const arvore = await getPrisma().helpdeskCategory.findMany({ where: { tenantId: c.ctx.tenantId }, select: { id: true, parentId: true } });
    let mudou = true;
    while (mudou) { mudou = false; for (const cat of arvore) if (cat.parentId && idsCategoria.has(cat.parentId) && !idsCategoria.has(cat.id)) { idsCategoria.add(cat.id); mudou = true; } }
  }
  const base: Prisma.HelpdeskTicketWhereInput = { AND: [whereVisivel(c), await filtroDaBusca(c, filtros.q?.trim().slice(0, 255) ?? "", filtros.em),
    filtros.categoria ? { categoryId: { in: [...idsCategoria] } } : {}, filtros.setor ? { requesterSectorCode: filtros.setor } : {},
    filtros.responsavel ? { assignees: { some: { userId: filtros.responsavel } } } : {},
    filtros.meus === "1" ? { assignees: { some: { userId: c.ctx.userId } } } : {},
  ] };
  // Quem não acompanha a fila (27/10/2026) vê só "Abertos" e o Histórico: as
  // abas de atendimento são da equipe responsável e do administrador.
  const padrao = podeVerInterno(c.ctx, c.config) ? "fila" : "abertos";
  const estadosPorAba: Record<string, Prisma.HelpdeskTicketWhereInput> = {
    abertos: { status: { notIn: ["RESOLVIDO", "CANCELADO"] } },
    fila: { status: { in: ["ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_APROVACAO"] } },
    aguardando: { status: { in: ["AGUARDANDO_USUARIO", "AGUARDANDO_REQUERENTE"] } },
    pausa: { status: "STANDBY" },
    historico: { status: { in: ["RESOLVIDO", "CANCELADO"] } },
  };
  const statusFiltro = filtros.status && STATUS.includes(filtros.status as never) ? { status: filtros.status as never } : null;
  const filtroAba = statusFiltro ?? estadosPorAba[filtros.aba ?? padrao] ?? (filtros.encerrados === "1" ? estadosPorAba.historico : estadosPorAba[padrao]);
  const filtroPrioridade = filtros.prioridade && PRIORIDADES.includes(filtros.prioridade as never) ? { priority: filtros.prioridade as never } : {};
  const where: Prisma.HelpdeskTicketWhereInput = { AND: [base, filtroAba, filtroPrioridade] };
  const countAba = (aba: string) => getPrisma().helpdeskTicket.count({ where: { AND: [base, estadosPorAba[aba]] } });
  const [rows, total, drafts] = await Promise.all([
    getPrisma().helpdeskTicket.findMany({ where, include: { category: true, assignees: true, cycles: { orderBy: { cycleNumber: "desc" }, take: 1 } }, orderBy: filtros.status === "NA_FILA" || (!filtros.status && (filtros.aba ?? padrao) === "fila") ? [{ queueOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] : [{ updatedAt: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 25 }),
    getPrisma().helpdeskTicket.count({ where }),
    getPrisma().helpdeskDraft.findMany({ where: { tenantId: c.ctx.tenantId, createdById: c.ctx.userId, submittedAt: null }, orderBy: { updatedAt: "desc" }, take: 20 }),
  ]);
  const [abertosCount, filaCount, aguardandoCount, pausaCount, historicoCount] = await Promise.all(["abertos", "fila", "aguardando", "pausa", "historico"].map(countAba));
  const fila = await getPrisma().helpdeskTicket.findMany({ where: { AND: [whereVisivel(c), { status: "NA_FILA" }] }, orderBy: [{ queueOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return { rows, total, page, drafts, counts: { abertos: abertosCount, fila: filaCount, aguardando: aguardandoCount, pausa: pausaCount, historico: historicoCount }, posicoes: new Map(fila.map((t, i) => [t.id, i + 1])), totalFila: fila.length };
}
// A busca procura no escopo escolhido ao lado da caixa (26/10/2026): no próprio
// chamado (título, descrição, protocolo), no setor solicitante ou no responsável.
async function filtroDaBusca(c: Contexto, q: string, em?: string): Promise<Prisma.HelpdeskTicketWhereInput> {
  if (!q) return {};
  if (em === "setor") {
    const setores = await getPrisma().sector.findMany({ where: { tenantId: c.ctx.tenantId, OR: [{ label: { contains: q } }, { code: { contains: q } }] }, select: { code: true } });
    return { requesterSectorCode: { in: setores.map(s => s.code) } };
  }
  if (em === "responsavel") {
    const pessoas = await getPrisma().user.findMany({ where: { tenantId: c.ctx.tenantId, name: { contains: q } }, select: { id: true }, take: 200 });
    return { assignees: { some: { userId: { in: pessoas.map(u => u.id) } } } };
  }
  return { OR: [{ title: { contains: q } }, { description: { contains: q } }, { id: { startsWith: q } }] };
}
export async function detalhe(c: Contexto, id: string) {
  const interno = podeVerInterno(c.ctx, c.config);
  const t = await getPrisma().helpdeskTicket.findFirst({ where: { AND: [whereVisivel(c), { id }] }, include: {
    category: true, assignees: true, participants: true, cycles: { orderBy: { cycleNumber: "desc" } },
    checklist: interno ? { orderBy: { key: "asc" } } : false,
    comments: { where: interno ? {} : { internal: false }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    attachments: { where: interno ? {} : { internal: false } },
    events: { where: interno ? {} : { internal: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 },
    approvals: { orderBy: { cycleNumber: "desc" } }, reopenRequests: { orderBy: { createdAt: "desc" } },
    draft: { include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } },
  } });
  if (!t || !podeVer(c.ctx, c.config, { ...t, approverIds: strings(t.approverIds) })) throw new Error("Chamado não encontrado.");
  return t;
}
export async function usuarios(c: Contexto) {
  return getPrisma().user.findMany({ where: { tenantId: c.ctx.tenantId, active: true }, select: { id: true, name: true, role: true, sectors: { select: { sectorCode: true } } }, orderBy: { name: "asc" } });
}
export function resumoRascunho(payload: unknown) {
  const dados = dadosRascunhoSchema.safeParse(payload);
  return !dados.success ? "Novo chamado" : dados.data.title || tituloDaDescricao(dados.data.description);
}
export function parecerAtual(d: { version: number; reviewVersion: number | null; review: unknown }) {
  const r = parecerSchema.safeParse(d.review); return d.reviewVersion === d.version && r.success ? r.data : null;
}
export async function indicadores(c: Contexto) {
  const rows = await getPrisma().helpdeskTicket.findMany({ where: whereVisivel(c), select: { status: true, priority: true, requesterSectorCode: true, createdAt: true, closedAt: true, assignees: true, cycles: true } });
  const agora = new Date();
  return {
    total: rows.length, abertos: rows.filter(t => !fechado(t.status)).length,
    porStatus: STATUS.map(s => ({ nome: s, total: rows.filter(t => t.status === s).length })),
    porPrioridade: ["BAIXA", "MEDIA", "ALTA", "URGENTE"].map(s => ({ nome: s, total: rows.filter(t => t.priority === s).length })),
    porSetor: [...new Set(rows.map(t => t.requesterSectorCode))].map(s => ({ nome: s, total: rows.filter(t => t.requesterSectorCode === s).length })),
    porResponsavel: [...new Set(rows.flatMap(t => t.assignees.map(a => a.userId)))].map(id => ({ nome: id, total: rows.filter(t => t.assignees.some(a => a.userId === id)).length })),
    resolucoes: rows.filter(t => t.closedAt).length,
    mediaHoras: rows.filter(t => t.closedAt).reduce((s, t) => s + (t.closedAt!.getTime() - t.createdAt.getTime()) / 3600000, 0) / (rows.filter(t => t.closedAt).length || 1),
    reabertos: rows.filter(t => t.cycles.length > 1).length,
    ciclos: rows.flatMap(t => t.cycles).length,
    noPrazo: rows.flatMap(t => t.cycles).filter(c => c.resolvedAt && c.resolvedAt <= c.resolutionDueAt).length,
    atrasados: rows.filter(t => !fechado(t.status) && t.cycles.some(c => !c.resolvedAt && !c.pausedAt && c.resolutionDueAt < agora)).length,
    primeiraRespostaNoPrazo: rows.flatMap(t => t.cycles).filter(c => c.firstResponseAt && c.firstResponseAt <= c.firstResponseDueAt).length,
  };
}
