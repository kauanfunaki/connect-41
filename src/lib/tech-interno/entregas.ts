// Entregas da Tech (04/11/2026, lote D dos ajustes de 03/11 — "outro modelo de
// produtividade dos devs"). PR, commit e token medem atividade e se inflam; a
// unidade daqui é a entrega validada, pesada pelo tamanho combinado antes de
// começar (`PESO_DO_TAMANHO`), com o tempo de ciclo, o retrabalho e os chamados
// ao lado. O GitHub continua no módulo dele, como contexto.
//
// A linha do tempo de cada item sai do histórico do próprio item
// (`TechInternalChange`, campo "Situação"): não há coluna de início nem de fim.
// Puro — testado; quem busca é `entregasDoPeriodo`.

import { getPrisma } from "@/lib/prisma";
import { PESO_DO_TAMANHO, SITUACOES, TAMANHOS, type Alteracao } from "./regras";

const DIA_MS = 24 * 60 * 60 * 1000;

export type ItemParaEntregas = {
  id: string;
  title: string;
  status: keyof typeof SITUACOES;
  size: keyof typeof TAMANHOS | null;
  assigneeId: string | null;
  assigneeName: string | null;
  originItemId: string | null;
  createdAt: Date;
};

export type MudancaParaEntregas = { itemId: string; createdAt: Date; changes: Alteracao[] };

export type LinhaDoItem = {
  id: string;
  concluidoEm: Date | null;
  inicioEm: Date | null;
  validado: boolean;
  voltasDaValidacao: number;
};

/** A linha do tempo de um item a partir das mudanças de "Situação". */
export function linhaDoItem(id: string, mudancas: MudancaParaEntregas[]): LinhaDoItem {
  const eventos = mudancas
    .filter((m) => m.itemId === id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .flatMap((m) => m.changes.filter((c) => c.field === "Situação").map((c) => ({ quando: m.createdAt, de: c.before, para: c.after })));
  let inicioEm: Date | null = null;
  let concluidoEm: Date | null = null;
  let passouPelaValidacao = false;
  let validado = false;
  let voltas = 0;
  for (const e of eventos) {
    if (e.para === SITUACOES.IN_PROGRESS && !inicioEm) inicioEm = e.quando;
    if (e.para === SITUACOES.VALIDATION) passouPelaValidacao = true;
    if (e.de === SITUACOES.VALIDATION && (e.para === SITUACOES.IN_PROGRESS || e.para === SITUACOES.PENDING)) voltas++;
    if (e.para === SITUACOES.DONE) {
      concluidoEm = e.quando;
      validado = passouPelaValidacao;
    }
  }
  return { id, concluidoEm, inicioEm, validado, voltasDaValidacao: voltas };
}

export type ChamadoParaEntregas = { userIds: string[]; resolvedAt: Date; resolutionDueAt: Date; cycleNumber: number };

export type PessoaNasEntregas = {
  userId: string | null;
  nome: string;
  entregas: number;
  validadas: number;
  pontos: number;
  semTamanho: number;
  cicloMedianoDias: number | null;
  voltasDaValidacao: number;
  retrabalho: number;
  chamados: number;
  chamadosNoPrazo: number;
  chamadosReabertos: number;
};

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Por pessoa, no período: as entregas (concluídas no período), as validadas e
 * os pontos delas, o ciclo mediano, as voltas da validação, o retrabalho (itens
 * que dizem ter vindo de uma entrega dela) e os chamados resolvidos.
 */
export function entregasPorPessoa(
  itens: ItemParaEntregas[],
  mudancas: MudancaParaEntregas[],
  chamados: ChamadoParaEntregas[],
  nomes: ReadonlyMap<string, string>,
  inicio: Date,
  fim: Date
): PessoaNasEntregas[] {
  const por = new Map<string, PessoaNasEntregas & { ciclos: number[]; ids: Set<string> }>();
  const linha = (userId: string | null, nome: string) => {
    const k = userId ?? "";
    let l = por.get(k);
    if (!l) {
      l = { userId, nome, entregas: 0, validadas: 0, pontos: 0, semTamanho: 0, cicloMedianoDias: null, voltasDaValidacao: 0, retrabalho: 0, chamados: 0, chamadosNoPrazo: 0, chamadosReabertos: 0, ciclos: [], ids: new Set() };
      por.set(k, l);
    }
    return l;
  };

  for (const item of itens) {
    if (item.status !== "DONE") continue;
    const t = linhaDoItem(item.id, mudancas);
    if (!t.concluidoEm || t.concluidoEm < inicio || t.concluidoEm > fim) continue;
    const l = linha(item.assigneeId, item.assigneeName ?? "Sem responsável");
    l.entregas++;
    l.ids.add(item.id);
    l.voltasDaValidacao += t.voltasDaValidacao;
    if (t.validado) {
      l.validadas++;
      if (item.size) l.pontos += PESO_DO_TAMANHO[item.size];
      else l.semTamanho++;
    }
    if (t.inicioEm) l.ciclos.push((t.concluidoEm.getTime() - t.inicioEm.getTime()) / DIA_MS);
  }
  // Retrabalho: item que diz ter vindo de uma entrega do período.
  const dono = new Map<string, string>();
  for (const [k, l] of por) for (const id of l.ids) dono.set(id, k);
  for (const item of itens) {
    const k = item.originItemId ? dono.get(item.originItemId) : undefined;
    if (k !== undefined) por.get(k)!.retrabalho++;
  }
  for (const c of chamados) {
    if (c.resolvedAt < inicio || c.resolvedAt > fim) continue;
    for (const userId of c.userIds) {
      const l = linha(userId, nomes.get(userId) ?? "Alguém da Tech");
      l.chamados++;
      if (c.resolvedAt <= c.resolutionDueAt) l.chamadosNoPrazo++;
      if (c.cycleNumber > 1) l.chamadosReabertos++;
    }
  }
  return [...por.values()]
    .map((l) => {
      const m = mediana(l.ciclos);
      return {
        userId: l.userId, nome: l.nome, entregas: l.entregas, validadas: l.validadas, pontos: l.pontos, semTamanho: l.semTamanho,
        cicloMedianoDias: m === null ? null : Math.round(m * 10) / 10,
        voltasDaValidacao: l.voltasDaValidacao, retrabalho: l.retrabalho, chamados: l.chamados, chamadosNoPrazo: l.chamadosNoPrazo, chamadosReabertos: l.chamadosReabertos,
      };
    })
    .sort((a, b) => b.pontos - a.pontos || b.validadas - a.validadas || a.nome.localeCompare(b.nome, "pt-BR"));
}

export const PERIODOS_DAS_ENTREGAS = [
  { chave: "trimestre", rotulo: "Este trimestre" },
  { chave: "anterior", rotulo: "Trimestre passado" },
  { chave: "90", rotulo: "Últimos 90 dias" },
] as const;
export type PeriodoDasEntregas = (typeof PERIODOS_DAS_ENTREGAS)[number]["chave"];

/** O intervalo do período, em UTC (o trimestre civil). */
export function intervaloDasEntregas(periodo: PeriodoDasEntregas, agora: Date): { inicio: Date; fim: Date } {
  if (periodo === "90") return { inicio: new Date(agora.getTime() - 90 * DIA_MS), fim: agora };
  const t = Math.floor(agora.getUTCMonth() / 3) - (periodo === "anterior" ? 1 : 0);
  const ano = agora.getUTCFullYear() + Math.floor(t / 4);
  const tri = ((t % 4) + 4) % 4;
  const inicio = new Date(Date.UTC(ano, tri * 3, 1));
  const fim = periodo === "anterior" ? new Date(Date.UTC(ano, tri * 3 + 3, 1) - 1) : agora;
  return { inicio, fim };
}

/** Busca o período e monta as linhas. */
export async function entregasDoPeriodo(tenantId: string, periodo: PeriodoDasEntregas, agora = new Date()) {
  const { inicio, fim } = intervaloDasEntregas(periodo, agora);
  const prisma = getPrisma();
  const [itens, chamadosBrutos] = await Promise.all([
    prisma.techInternalItem.findMany({
      // Concluídos que mexeram desde o início do período, mais os que dizem vir de algum.
      where: { tenantId, OR: [{ status: "DONE", updatedAt: { gte: inicio } }, { originItemId: { not: null } }] },
      select: { id: true, title: true, status: true, size: true, assigneeId: true, originItemId: true, createdAt: true, assignee: { select: { name: true } } },
      take: 5000,
    }),
    prisma.helpdeskSlaCycle.findMany({
      where: { tenantId, resolvedAt: { gte: inicio, lte: fim } },
      select: { ticketId: true, resolvedAt: true, resolutionDueAt: true, cycleNumber: true },
      take: 5000,
    }),
  ]);
  const [mudancas, atribuicoes] = await Promise.all([
    prisma.techInternalChange.findMany({
      where: { tenantId, itemId: { in: itens.filter((i) => i.status === "DONE").map((i) => i.id) } },
      select: { itemId: true, createdAt: true, changes: true },
    }),
    prisma.helpdeskAssignee.findMany({
      where: { tenantId, ticketId: { in: [...new Set(chamadosBrutos.map((c) => c.ticketId))] } },
      select: { ticketId: true, userId: true },
    }),
  ]);
  const quemNoChamado = new Map<string, string[]>();
  for (const a of atribuicoes) quemNoChamado.set(a.ticketId, [...(quemNoChamado.get(a.ticketId) ?? []), a.userId]);
  const pessoas = await prisma.user.findMany({ where: { id: { in: [...new Set(atribuicoes.map((a) => a.userId))] } }, select: { id: true, name: true } });
  const nomes = new Map(pessoas.map((p) => [p.id, p.name]));
  return {
    inicio,
    fim,
    pessoas: entregasPorPessoa(
      itens.map((i) => ({ ...i, assigneeName: i.assignee?.name ?? null })),
      mudancas.map((m) => ({ itemId: m.itemId, createdAt: m.createdAt, changes: (Array.isArray(m.changes) ? m.changes : []) as unknown as Alteracao[] })),
      chamadosBrutos.map((c) => ({ userIds: quemNoChamado.get(c.ticketId) ?? [], resolvedAt: c.resolvedAt!, resolutionDueAt: c.resolutionDueAt, cycleNumber: c.cycleNumber })),
      nomes,
      inicio,
      fim
    ),
  };
}
