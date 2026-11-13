// O lado do servidor da Gestão: lê os itens de trabalho de todos os setores e
// os devolve no formato único de `regras.ts`. Painel, carga dos coordenadores
// e alertas partem daqui.
//
// Concluído só entra se terminou nos últimos 30 dias — a coluna "Concluídos"
// do painel é o que acabou de sair, não o histórico inteiro.
//
// Duas leituras (13/11/2026, melhoria-662). A primeira, leve, traz de cada
// item só o que a régua usa (estado, prazo, responsáveis, última
// movimentação), e a última movimentação sai agregada no banco: o Prisma não
// limita o `take` de uma relação por registro — o `activities … take: 1` de
// cada card trazia todas as atividades dele para pegar uma, e o processo
// trazia todas as etapas, protocolos e mensagens. A segunda, `comTitulos`,
// monta o título (empresa, tipo, quadro) só dos itens que a tela mostra.

import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { sectorLabel } from "@/lib/sectors";
import { assuntoDaTransferencia } from "@/lib/handoffs";
import { enderecoDaTarefa, enderecoDe } from "@/lib/enderecoCurto";
import {
  classificar,
  limitesDoSetor,
  podeVerSetor,
  type Classificacao,
  type Estado,
  type ItemDeTrabalho,
  type ItemLeve,
  type Limites,
  type Origem,
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
  /**
   * Concluídos a partir desta data (05/11/2026, a Produtividade da Gestão mede
   * o período escolhido). Sem ela, os dos últimos 30 dias, como sempre.
   */
  concluidosDesde?: Date;
};

function inicioDosConcluidos(agora: Date, filtro: FiltroDeItens): Date {
  return filtro.concluidosDesde ?? new Date(agora.getTime() - JANELA_DE_CONCLUIDOS);
}

function doSetor(filtro: FiltroDeItens, setor: string): boolean {
  return !filtro.setores || filtro.setores === "todos" || filtro.setores.includes(setor);
}

function setoresDoFiltro(filtro: FiltroDeItens): string[] | null {
  return !filtro.setores || filtro.setores === "todos" ? null : filtro.setores;
}

function maisRecente(...datas: (Date | null | undefined)[]): Date {
  return new Date(Math.max(...datas.filter((d): d is Date => !!d).map((d) => d.getTime())));
}

/** `id → data` de um `groupBy` com `_max`. */
function porId<K extends string, C extends string>(linhas: ({ [k in K]: string | null } & { _max: { [c in C]: Date | null } })[], chave: K, campo: C) {
  return new Map(linhas.map((l) => [l[chave] as string, l._max[campo]]));
}

async function processos(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemLeve[]> {
  const setor = (await setorDoModulo(tenantId, "societario_processos")) ?? "societario";
  if (!doSetor(filtro, setor)) return [];
  const prisma = getPrisma();
  const lista = await prisma.process.findMany({
    where: {
      tenantId,
      ...(filtro.responsavel ? { ownerUserId: filtro.responsavel } : {}),
      OR: [
        { status: { notIn: ["CONCLUIDO", "CANCELADO", "INDEFERIDO"] } },
        { status: "CONCLUIDO", concludedAt: { gte: inicioDosConcluidos(agora, filtro) } },
      ],
    },
    select: {
      id: true,
      number: true,
      status: true,
      dueAt: true,
      updatedAt: true,
      concludedAt: true,
      ownerUserId: true,
      companyId: true,
    },
    take: TETO,
  });
  if (lista.length === 0) return [];
  const ids = lista.map((p) => p.id);
  // Por etapa e situação: a etapa mais recente e se alguma já saiu do
  // "pendente" ("andou") numa consulta só.
  const [etapas, protocolos, mensagens] = await Promise.all([
    prisma.processStep.groupBy({ by: ["processId", "status"], where: { processId: { in: ids } }, _max: { updatedAt: true } }),
    prisma.processProtocol.groupBy({ by: ["processId"], where: { processId: { in: ids } }, _max: { updatedAt: true } }),
    prisma.processMessage.groupBy({ by: ["processId"], where: { processId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const ultimaEtapa = new Map<string, Date>();
  const andou = new Set<string>();
  for (const e of etapas) {
    if (e.status !== "PENDENTE") andou.add(e.processId);
    const d = e._max.updatedAt;
    if (d && (!ultimaEtapa.has(e.processId) || d > ultimaEtapa.get(e.processId)!)) ultimaEtapa.set(e.processId, d);
  }
  const ultimoProtocolo = porId(protocolos, "processId", "updatedAt");
  const ultimaMensagem = porId(mensagens, "processId", "createdAt");

  return lista.map((p) => {
    const estado: Estado =
      p.status === "CONCLUIDO"
        ? "CONCLUIDO"
        : p.status === "AGUARDANDO_ORGAO"
          ? "ESPERANDO_ORGAO"
          : p.status === "AGUARDANDO_CLIENTE"
            ? "ESPERANDO_CLIENTE"
            : p.status === "SUSPENSO"
              ? "PAUSADO"
              : andou.has(p.id)
                ? "ANDAMENTO"
                : "NAO_INICIADO";
    return {
      origem: "PROCESSO",
      id: p.id,
      setor,
      responsaveis: p.ownerUserId ? [p.ownerUserId] : [],
      estado,
      ultimaMovimentacao: maisRecente(p.updatedAt, ultimaEtapa.get(p.id), ultimoProtocolo.get(p.id), ultimaMensagem.get(p.id)),
      prazo: p.dueAt,
      concluidoEm: p.concludedAt,
      // Os links pelo endereço curto (10/11/2026, pedido do Kauan).
      href: enderecoDe("processo", p),
      empresaId: p.companyId,
    };
  });
}

async function cards(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemLeve[]> {
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
      OR: [{ stage: { type: { not: "DONE" } } }, { updatedAt: { gte: inicioDosConcluidos(agora, filtro) } }],
    },
    select: {
      id: true,
      number: true,
      entityType: true,
      entityId: true,
      dueDate: true,
      updatedAt: true,
      pipelineId: true,
      pipeline: { select: { sectorCode: true } },
      stage: { select: { type: true } },
      assignees: { select: { userId: true } },
    },
    take: TETO,
  });
  const atividades =
    lista.length > 0
      ? await prisma.activity.groupBy({
          by: ["pipelineItemId"],
          where: { tenantId, pipelineItemId: { in: lista.map((c) => c.id) } },
          _max: { createdAt: true },
        })
      : [];
  const ultimaAtividade = porId(atividades, "pipelineItemId", "createdAt");

  return lista.map((c) => {
    const estado: Estado =
      c.stage.type === "DONE" ? "CONCLUIDO" : c.stage.type === "PENDING" ? "PAUSADO" : c.stage.type === "IN_PROGRESS" ? "ANDAMENTO" : "NAO_INICIADO";
    return {
      origem: "CARD",
      id: c.id,
      setor: c.pipeline.sectorCode,
      responsaveis: c.assignees.map((a) => a.userId),
      estado,
      ultimaMovimentacao: maisRecente(c.updatedAt, ultimaAtividade.get(c.id)),
      prazo: c.dueDate,
      concluidoEm: estado === "CONCLUIDO" ? c.updatedAt : null,
      href: enderecoDaTarefa(c.pipelineId, c),
      empresaId: c.entityType === "COMPANY" ? c.entityId : null,
    };
  });
}

async function pendencias(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemLeve[]> {
  // Desde 01/10 a pendência guarda o setor que pediu; as de antes (sem setor)
  // são do setor do módulo, como sempre foram.
  const padrao = (await setorDoModulo(tenantId, "bpo_pendencias")) ?? "bpo";
  const lista = await getPrisma().clientRequest.findMany({
    where: {
      tenantId,
      ...(filtro.responsavel ? { createdById: filtro.responsavel } : {}),
      OR: [
        { status: { in: ["ABERTA", "RESPONDIDA"] } },
        { status: "RESOLVIDA", resolvedAt: { gte: inicioDosConcluidos(agora, filtro) } },
      ],
    },
    select: {
      id: true,
      number: true,
      status: true,
      dueDate: true,
      updatedAt: true,
      resolvedAt: true,
      createdById: true,
      companyId: true,
      sectorCode: true,
    },
    take: TETO,
  });
  return lista
    .map((r) => ({ r, setor: r.sectorCode ?? padrao }))
    .filter(({ setor }) => doSetor(filtro, setor))
    .map(({ r, setor }) => ({
      origem: "PENDENCIA",
      id: r.id,
      setor,
      responsaveis: r.createdById ? [r.createdById] : [],
      // Aberta é o cliente devendo resposta; respondida é a equipe devendo ação.
      estado: r.status === "RESOLVIDA" ? "CONCLUIDO" : r.status === "ABERTA" ? "ESPERANDO_CLIENTE" : "ANDAMENTO",
      ultimaMovimentacao: r.updatedAt,
      prazo: r.dueDate,
      concluidoEm: r.resolvedAt,
      href: enderecoDe("pendencia", r),
      empresaId: r.companyId,
    }));
}

/**
 * As solicitações que os clientes abrem pelo portal (01/10), no setor que
 * atende e com o responsável delas — a fila única do lado da 41.
 *
 * O prazo é o da primeira resposta prometida ao cliente: depois de respondida
 * ela segue na fila, mas sem prazo, porque a promessa foi cumprida. Cancelada
 * não entra (some do trabalho, como a pendência cancelada).
 */
async function solicitacoes(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemLeve[]> {
  if (!(await isModuleEnabled(tenantId, "portal_solicitacoes"))) return [];
  const setores = setoresDoFiltro(filtro);
  const lista = await getPrisma().serviceRequest.findMany({
    where: {
      tenantId,
      ...(setores ? { sectorCode: { in: setores } } : {}),
      ...(filtro.responsavel ? { assigneeId: filtro.responsavel } : {}),
      OR: [
        { status: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE"] } },
        { status: "CONCLUIDA", closedAt: { gte: inicioDosConcluidos(agora, filtro) } },
      ],
    },
    select: {
      id: true,
      number: true,
      status: true,
      sectorCode: true,
      assigneeId: true,
      companyId: true,
      responseDue: true,
      firstResponseAt: true,
      updatedAt: true,
      closedAt: true,
    },
    take: TETO,
  });
  const ESTADO: Record<(typeof lista)[number]["status"], Estado> = {
    ABERTA: "NAO_INICIADO",
    EM_ANDAMENTO: "ANDAMENTO",
    AGUARDANDO_CLIENTE: "ESPERANDO_CLIENTE",
    CONCLUIDA: "CONCLUIDO",
    CANCELADA: "CONCLUIDO",
  };
  return lista.map((s) => ({
    origem: "SOLICITACAO",
    id: s.id,
    setor: s.sectorCode,
    responsaveis: s.assigneeId ? [s.assigneeId] : [],
    estado: ESTADO[s.status],
    ultimaMovimentacao: s.updatedAt,
    prazo: s.firstResponseAt ? null : s.responseDue,
    concluidoEm: s.closedAt,
    href: enderecoDe("solicitacao", s),
    empresaId: s.companyId,
  }));
}

async function transferencias(tenantId: string, agora: Date, filtro: FiltroDeItens): Promise<ItemLeve[]> {
  const setores = setoresDoFiltro(filtro);
  const lista = await getPrisma().handoffSector.findMany({
    where: {
      tenantId,
      ...(filtro.responsavel ? { assignees: { some: { userId: filtro.responsavel } } } : {}),
      ...(setores ? { sectorCode: { in: setores } } : {}),
      OR: [{ status: { not: "DONE" } }, { resolvedAt: { gte: inicioDosConcluidos(agora, filtro) } }],
    },
    select: {
      id: true,
      handoffId: true,
      sectorCode: true,
      status: true,
      updatedAt: true,
      resolvedAt: true,
      assignees: { select: { userId: true } },
      handoff: { select: { number: true } },
    },
    take: TETO,
  });
  return lista.map((h) => ({
    origem: "TRANSFERENCIA",
    id: h.id,
    setor: h.sectorCode,
    responsaveis: h.assignees.map((a) => a.userId),
    // A devolvida (10/11/2026) espera quem pediu responder: na Gestão é
    // "pausada" — parada de propósito, sem alerta de parado para o setor.
    estado: h.status === "DONE" ? "CONCLUIDO" : h.status === "IN_PROGRESS" ? "ANDAMENTO" : h.status === "RETURNED" ? "PAUSADO" : "NAO_INICIADO",
    ultimaMovimentacao: h.updatedAt,
    prazo: null,
    concluidoEm: h.resolvedAt,
    href: enderecoDe("transferencia", { id: h.handoffId, number: h.handoff.number }),
  }));
}

/** Os itens de trabalho de todos os setores, sem classificar e sem título. */
export async function coletarItens(tenantId: string, agora = new Date(), filtro: FiltroDeItens = {}): Promise<ItemLeve[]> {
  const partes = await Promise.all([
    processos(tenantId, agora, filtro),
    cards(tenantId, agora, filtro),
    pendencias(tenantId, agora, filtro),
    transferencias(tenantId, agora, filtro),
    solicitacoes(tenantId, agora, filtro),
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

export type ItemClassificado<T extends ItemLeve = ItemLeve> = { item: T; c: Classificacao };

/**
 * Todos os itens de trabalho que o recorte enxerga, já classificados — sem o
 * título; para as linhas que a tela mostra, `comTitulos`.
 * `recorte` vem de `recorteDaGestao`: "todos" ou a lista de setores.
 */
export async function itensDaGestao(
  tenantId: string,
  recorte: "todos" | string[],
  agora = new Date(),
  filtro: Pick<FiltroDeItens, "responsavel" | "concluidosDesde"> = {}
): Promise<ItemClassificado[]> {
  const [itens, limites] = await Promise.all([coletarItens(tenantId, agora, { ...filtro, setores: recorte }), limitesPorSetor(tenantId)]);
  return itens
    .filter((i) => podeVerSetor(recorte, i.setor))
    .map((item) => ({ item, c: classificar(item, limites.get(item.setor) ?? limitesDoSetor(undefined), agora) }));
}

// ─── Os títulos, só do que aparece ───────────────────────────────────────────

/** A chave de um item entre as origens: os ids são de tabelas diferentes. */
export const chaveDoItem = (origem: Origem, id: string) => `${origem}:${id}`;

async function titulosDosProcessos(tenantId: string, ids: string[]): Promise<[string, string][]> {
  if (ids.length === 0) return [];
  const lista = await getPrisma().process.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, title: true, type: { select: { name: true } }, company: { select: { name: true, displayName: true } } },
  });
  return lista.map((p) => [p.id, `${p.type.name} — ${nomeExibicao(p.company)}${p.title ? ` (${p.title})` : ""}`]);
}

async function titulosDosCards(tenantId: string, ids: string[]): Promise<[string, string][]> {
  if (ids.length === 0) return [];
  const prisma = getPrisma();
  const lista = await prisma.pipelineItem.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, title: true, entityType: true, entityId: true, pipeline: { select: { name: true } } },
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
  return lista.map((c) => [c.id, `${c.title ?? (c.entityId ? nomeDe.get(c.entityId) : null) ?? "Card sem título"} — ${c.pipeline.name}`]);
}

async function titulosDasPendencias(tenantId: string, ids: string[]): Promise<[string, string][]> {
  if (ids.length === 0) return [];
  const lista = await getPrisma().clientRequest.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, title: true, company: { select: { name: true, displayName: true } } },
  });
  return lista.map((r) => [r.id, `${r.title} — ${nomeExibicao(r.company)}`]);
}

async function titulosDasSolicitacoes(tenantId: string, ids: string[]): Promise<[string, string][]> {
  if (ids.length === 0) return [];
  const lista = await getPrisma().serviceRequest.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, number: true, subject: { select: { label: true } }, company: { select: { name: true, displayName: true } } },
  });
  return lista.map((s) => [s.id, `Nº ${s.number} · ${s.subject.label} — ${nomeExibicao(s.company)}`]);
}

async function titulosDasTransferencias(tenantId: string, ids: string[]): Promise<[string, string][]> {
  if (ids.length === 0) return [];
  const prisma = getPrisma();
  const [lista, setores] = await Promise.all([
    prisma.handoffSector.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, handoff: { select: { fromSector: true, subject: true, message: true, description: true } } },
    }),
    prisma.sector.findMany({ where: { tenantId }, select: { code: true, label: true } }),
  ]);
  // O nome do setor de origem, e não o código (10/11/2026, pedido do Kauan):
  // a Gestão mostrava "Transferência de fiscal".
  const rotulos = Object.fromEntries(setores.map((s) => [s.code, s.label]));
  return lista.map((h) => {
    // O assunto guardado (desde 10/11/2026) vem primeiro; as de antes seguem
    // com o começo da descrição.
    const assunto =
      assuntoDaTransferencia(h.handoff) ?? (h.handoff.description ?? h.handoff.message ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    return [h.id, `Transferência de ${sectorLabel(rotulos, h.handoff.fromSector)}${assunto ? ` — ${assunto}` : ""}`];
  });
}

/**
 * Os mesmos itens, na mesma ordem, com o título de cada um. Passe só o que a
 * tela vai mostrar: são até cinco consultas pelos ids, com as junções que o
 * título pede.
 */
export async function comTitulos(tenantId: string, itens: readonly ItemClassificado[]): Promise<ItemClassificado<ItemDeTrabalho>[]> {
  if (itens.length === 0) return [];
  const ids = (origem: Origem) => [...new Set(itens.filter((x) => x.item.origem === origem).map((x) => x.item.id))];
  const partes = await Promise.all([
    titulosDosProcessos(tenantId, ids("PROCESSO")).then((l) => l.map(([id, t]) => [chaveDoItem("PROCESSO", id), t] as const)),
    titulosDosCards(tenantId, ids("CARD")).then((l) => l.map(([id, t]) => [chaveDoItem("CARD", id), t] as const)),
    titulosDasPendencias(tenantId, ids("PENDENCIA")).then((l) => l.map(([id, t]) => [chaveDoItem("PENDENCIA", id), t] as const)),
    titulosDasSolicitacoes(tenantId, ids("SOLICITACAO")).then((l) => l.map(([id, t]) => [chaveDoItem("SOLICITACAO", id), t] as const)),
    titulosDasTransferencias(tenantId, ids("TRANSFERENCIA")).then((l) => l.map(([id, t]) => [chaveDoItem("TRANSFERENCIA", id), t] as const)),
  ]);
  const titulo = new Map<string, string>(partes.flat());
  // Apagado entre as duas leituras: a linha continua, com o link.
  return itens.map((x) => ({ item: { ...x.item, titulo: titulo.get(chaveDoItem(x.item.origem, x.item.id)) ?? "—" }, c: x.c }));
}
