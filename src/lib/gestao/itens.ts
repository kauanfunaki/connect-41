// O lado do servidor da Gestão: lê os itens de trabalho de todos os setores e
// os devolve no formato único de `regras.ts`. Painel, carga dos coordenadores
// e alertas partem daqui.
//
// Concluído só entra se terminou nos últimos 30 dias — a coluna "Concluídos"
// do painel é o que acabou de sair, não o histórico inteiro.

import { getPrisma } from "@/lib/prisma";
import { setorDoModulo } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import {
  classificar,
  limitesDoSetor,
  podeVerSetor,
  type Classificacao,
  type Estado,
  type ItemDeTrabalho,
  type Limites,
} from "@/lib/gestao/regras";

const DIA = 24 * 60 * 60 * 1000;
const JANELA_DE_CONCLUIDOS = 30 * DIA;
const TETO = 5000;

/**
 * Recorte opcional da coleta, empurrado para dentro das consultas: o Meu dia
 * (30/09) pede os itens de uma pessoa ou de alguns setores, e trazer o tenant
 * inteiro para filtrar depois custaria o mesmo que o painel da Gestão a cada
 * abertura da tela do dia.
 */
export type FiltroDeItens = {
  /** Só os itens em que esta pessoa responde. */
  responsavel?: string;
  /** Só estes setores ("todos" ou ausente = sem recorte). */
  setores?: "todos" | string[];
};

function doSetor(filtro: FiltroDeItens, setor: string): boolean {
  return !filtro.setores || filtro.setores === "todos" || filtro.setores.includes(setor);
}

function setoresDoFiltro(filtro: FiltroDeItens): string[] | null {
  return !filtro.setores || filtro.setores === "todos" ? null : filtro.setores;
}

function maisRecente(...datas: (Date | null | undefined)[]): Date {
  return new Date(Math.max(...datas.filter((d): d is Date => !!d).map((d) => d.getTime())));
}

async function processos(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemDeTrabalho[]> {
  const setor = (await setorDoModulo(tenantId, "societario_processos")) ?? "societario";
  if (!doSetor(filtro, setor)) return [];
  const lista = await getPrisma().process.findMany({
    where: {
      tenantId,
      ...(filtro.responsavel ? { ownerUserId: filtro.responsavel } : {}),
      OR: [
        { status: { notIn: ["CONCLUIDO", "CANCELADO", "INDEFERIDO"] } },
        { status: "CONCLUIDO", concludedAt: { gte: new Date(agora.getTime() - JANELA_DE_CONCLUIDOS) } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueAt: true,
      updatedAt: true,
      concludedAt: true,
      ownerUserId: true,
      type: { select: { name: true } },
      company: { select: { name: true, displayName: true } },
      steps: { select: { status: true, updatedAt: true } },
      protocols: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      messages: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: TETO,
  });
  return lista.map((p) => {
    const andou = p.steps.some((s) => s.status !== "PENDENTE");
    const estado: Estado =
      p.status === "CONCLUIDO"
        ? "CONCLUIDO"
        : p.status === "AGUARDANDO_ORGAO"
          ? "ESPERANDO_ORGAO"
          : p.status === "AGUARDANDO_CLIENTE"
            ? "ESPERANDO_CLIENTE"
            : p.status === "SUSPENSO"
              ? "PAUSADO"
              : andou
                ? "ANDAMENTO"
                : "NAO_INICIADO";
    return {
      origem: "PROCESSO",
      id: p.id,
      titulo: `${p.type.name} — ${nomeExibicao(p.company)}${p.title ? ` (${p.title})` : ""}`,
      setor,
      responsaveis: p.ownerUserId ? [p.ownerUserId] : [],
      estado,
      ultimaMovimentacao: maisRecente(p.updatedAt, ...p.steps.map((s) => s.updatedAt), p.protocols[0]?.updatedAt, p.messages[0]?.createdAt),
      prazo: p.dueAt,
      concluidoEm: p.concludedAt,
      href: `/processos/${p.id}`,
    };
  });
}

async function cards(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemDeTrabalho[]> {
  const prisma = getPrisma();
  const setores = setoresDoFiltro(filtro);
  const lista = await prisma.pipelineItem.findMany({
    where: {
      tenantId,
      parentItemId: null,
      ...(filtro.responsavel ? { assignees: { some: { userId: filtro.responsavel } } } : {}),
      // O funil de uma vaga também é quadro, mas é do Recrutamento e tem a
      // tela dele: candidato não é "tarefa do setor".
      candidatura: { is: null },
      pipeline: { active: true, ...(setores ? { sectorCode: { in: setores } } : {}) },
      OR: [{ stage: { type: { not: "DONE" } } }, { updatedAt: { gte: new Date(agora.getTime() - JANELA_DE_CONCLUIDOS) } }],
    },
    select: {
      id: true,
      title: true,
      entityType: true,
      entityId: true,
      dueDate: true,
      updatedAt: true,
      pipelineId: true,
      pipeline: { select: { sectorCode: true, name: true } },
      stage: { select: { type: true } },
      assignees: { select: { userId: true } },
      activities: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: TETO,
  });

  // Card de empresa ou pessoa pode não ter título: o nome vem da entidade.
  const semTitulo = lista.filter((c) => !c.title && c.entityId);
  const idsEmpresa = semTitulo.filter((c) => c.entityType === "COMPANY").map((c) => c.entityId!);
  const idsPessoa = semTitulo.filter((c) => c.entityType === "PERSON").map((c) => c.entityId!);
  const [empresas, pessoas] = await Promise.all([
    idsEmpresa.length ? prisma.company.findMany({ where: { tenantId, id: { in: idsEmpresa } }, select: { id: true, name: true, displayName: true } }) : [],
    idsPessoa.length ? prisma.person.findMany({ where: { tenantId, id: { in: idsPessoa } }, select: { id: true, name: true } }) : [],
  ]);
  const nomeDe = new Map<string, string>([...empresas.map((e) => [e.id, nomeExibicao(e)] as const), ...pessoas.map((p) => [p.id, p.name] as const)]);

  return lista.map((c) => {
    const estado: Estado =
      c.stage.type === "DONE" ? "CONCLUIDO" : c.stage.type === "PENDING" ? "PAUSADO" : c.stage.type === "IN_PROGRESS" ? "ANDAMENTO" : "NAO_INICIADO";
    const ultima = maisRecente(c.updatedAt, c.activities[0]?.createdAt);
    return {
      origem: "CARD",
      id: c.id,
      titulo: `${c.title ?? (c.entityId ? nomeDe.get(c.entityId) : null) ?? "Card sem título"} — ${c.pipeline.name}`,
      setor: c.pipeline.sectorCode,
      responsaveis: c.assignees.map((a) => a.userId),
      estado,
      ultimaMovimentacao: ultima,
      prazo: c.dueDate,
      concluidoEm: estado === "CONCLUIDO" ? c.updatedAt : null,
      href: `/kanban/${c.pipelineId}/itens/${c.id}`,
    };
  });
}

async function pendencias(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemDeTrabalho[]> {
  // Desde 01/10 a pendência guarda o setor que pediu; as de antes (sem setor)
  // são do setor do módulo, como sempre foram.
  const padrao = (await setorDoModulo(tenantId, "bpo_pendencias")) ?? "bpo";
  const lista = await getPrisma().clientRequest.findMany({
    where: {
      tenantId,
      ...(filtro.responsavel ? { createdById: filtro.responsavel } : {}),
      OR: [
        { status: { in: ["ABERTA", "RESPONDIDA"] } },
        { status: "RESOLVIDA", resolvedAt: { gte: new Date(agora.getTime() - JANELA_DE_CONCLUIDOS) } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      updatedAt: true,
      resolvedAt: true,
      createdById: true,
      sectorCode: true,
      company: { select: { name: true, displayName: true } },
    },
    take: TETO,
  });
  return lista
    .map((r) => ({ r, setor: r.sectorCode ?? padrao }))
    .filter(({ setor }) => doSetor(filtro, setor))
    .map(({ r, setor }) => ({
      origem: "PENDENCIA",
      id: r.id,
      titulo: `${r.title} — ${nomeExibicao(r.company)}`,
      setor,
      responsaveis: r.createdById ? [r.createdById] : [],
      // Aberta é o cliente devendo resposta; respondida é a equipe devendo ação.
      estado: r.status === "RESOLVIDA" ? "CONCLUIDO" : r.status === "ABERTA" ? "ESPERANDO_CLIENTE" : "ANDAMENTO",
      ultimaMovimentacao: r.updatedAt,
      prazo: r.dueDate,
      concluidoEm: r.resolvedAt,
      href: `/pendencias/${r.id}`,
    }));
}

async function transferencias(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemDeTrabalho[]> {
  const setores = setoresDoFiltro(filtro);
  const lista = await getPrisma().handoffSector.findMany({
    where: {
      tenantId,
      ...(filtro.responsavel ? { assignees: { some: { userId: filtro.responsavel } } } : {}),
      ...(setores ? { sectorCode: { in: setores } } : {}),
      OR: [{ status: { not: "DONE" } }, { resolvedAt: { gte: new Date(agora.getTime() - JANELA_DE_CONCLUIDOS) } }],
    },
    select: {
      id: true,
      handoffId: true,
      sectorCode: true,
      status: true,
      updatedAt: true,
      resolvedAt: true,
      assignees: { select: { userId: true } },
      handoff: { select: { fromSector: true, message: true, description: true } },
    },
    take: TETO,
  });
  return lista.map((h) => {
    const assunto = (h.handoff.description ?? h.handoff.message ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    return {
      origem: "TRANSFERENCIA",
      id: h.id,
      titulo: `Transferência de ${h.handoff.fromSector}${assunto ? ` — ${assunto}` : ""}`,
      setor: h.sectorCode,
      responsaveis: h.assignees.map((a) => a.userId),
      estado: h.status === "DONE" ? "CONCLUIDO" : h.status === "IN_PROGRESS" ? "ANDAMENTO" : "NAO_INICIADO",
      ultimaMovimentacao: h.updatedAt,
      prazo: null,
      concluidoEm: h.resolvedAt,
      href: `/transferencias/${h.handoffId}`,
    };
  });
}

/** Os itens de trabalho de todos os setores, sem classificar. */
export async function coletarItens(tenantId: string, agora = new Date(), filtro: FiltroDeItens = {}): Promise<ItemDeTrabalho[]> {
  const partes = await Promise.all([
    processos(tenantId, agora, filtro),
    cards(tenantId, agora, filtro),
    pendencias(tenantId, agora, filtro),
    transferencias(tenantId, agora, filtro),
  ]);
  return partes.flat();
}

/** Os limites de alerta de cada setor do tenant. */
export async function limitesPorSetor(tenantId: string): Promise<Map<string, Limites>> {
  const setores = await getPrisma().sector.findMany({
    where: { tenantId },
    select: { code: true, alertStalledDays: true, alertDueSoonDays: true },
  });
  return new Map(setores.map((s) => [s.code, limitesDoSetor(s)]));
}

export type ItemClassificado = { item: ItemDeTrabalho; c: Classificacao };

/**
 * Todos os itens de trabalho que o recorte enxerga, já classificados.
 * `recorte` vem de `recorteDaGestao`: "todos" ou a lista de setores.
 */
export async function itensDaGestao(
  tenantId: string,
  recorte: "todos" | string[],
  agora = new Date(),
  filtro: Pick<FiltroDeItens, "responsavel"> = {}
): Promise<ItemClassificado[]> {
  const [itens, limites] = await Promise.all([coletarItens(tenantId, agora, { ...filtro, setores: recorte }), limitesPorSetor(tenantId)]);
  return itens
    .filter((i) => podeVerSetor(recorte, i.setor))
    .map((item) => ({ item, c: classificar(item, limites.get(item.setor) ?? limitesDoSetor(undefined), agora) }));
}
