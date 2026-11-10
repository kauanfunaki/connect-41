import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { PROFUNDIDADE_MAXIMA } from "@/lib/kanban/subatividades";
import type { ResumoDaConcluida } from "@/lib/kanban/concluidasDoQuadro";

// O que a página de uma lista do Kanban (/kanban/[id]) lê do banco (10/11/2026).
//
// Até aqui a página trazia a lista inteira de uma vez: todos os itens, os
// concluídos de anos inclusive, com etiquetas e responsáveis; todas as
// mudanças de etapa da lista, sem limite, só para o "dias na etapa"; e as 200
// atividades mais recentes da lista toda para a "última atividade" e o
// "criado por" — o item antigo ficava sem criador, e o filtro de Criador o
// perdia. Agora:
// - os itens de topo abertos vêm inteiros (é com eles que se trabalha);
// - de cada coluna concluída, só as `limiteDeConcluidas` mais recentes, mais o
//   total da coluna para o "Ver mais concluídas (50 de N)";
// - o pai concluído que ainda tem subatividade aberta, em qualquer nível, vem
//   junto, por mais antigo que seja: a subatividade aberta não some do quadro;
// - as subatividades vêm nível a nível, só abaixo dos itens carregados;
// - "dias na etapa", criador e última atividade, só dos itens de topo
//   carregados — os únicos que mostram essas três coisas.

const INCLUDE_DO_ITEM = {
  stage: { select: { name: true, isTerminal: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  assignees: { include: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.PipelineItemInclude;

export type ItemDoQuadro = Prisma.PipelineItemGetPayload<{ include: typeof INCLUDE_DO_ITEM }>;

const ROTULO_DA_ATIVIDADE: Record<string, string> = {
  NOTE: "Nota", STATUS_CHANGE: "Mudou de etapa", DOCUMENT: "Anexou documento",
  HANDOFF: "Transferência", MENTION: "Menção", CREATED: "Criado",
  PRIORITY_CHANGE: "Mudou prioridade", DUE_DATE_CHANGE: "Mudou prazo",
  DESCRIPTION_CHANGE: "Editou descrição", ASSIGNEE_CHANGE: "Mudou responsável", TAG_CHANGE: "Mudou etiqueta",
};

function lerLista(where: Prisma.PipelineWhereInput) {
  return getPrisma().pipeline.findFirst({
    where,
    include: {
      space: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      stages: { orderBy: { order: "asc" } },
    },
  });
}

type ListaDoQuadro = NonNullable<Awaited<ReturnType<typeof lerLista>>>;

export type Quadro = {
  pipeline: ListaDoQuadro;
  /** Os itens carregados, de todos os níveis, numa lista plana — a árvore se monta com `montarArvore`. */
  itens: ItemDoQuadro[];
  /** Por coluna concluída: o total no banco e quantas atividades de topo vieram. */
  concluidas: Record<string, ResumoDaConcluida>;
  /** A última mudança de etapa de cada item de topo (sem mudança, o item conta da criação). */
  ultimaMudancaDeEtapa: Record<string, Date>;
  /** A linha da última atividade, de qualquer tipo, de cada item de topo. */
  ultimaAtividade: Record<string, string>;
  /** Quem criou cada item de topo. */
  criador: Record<string, { id: string; name: string }>;
};

export async function carregarQuadro({
  tenantId,
  where,
  limiteDeConcluidas,
}: {
  tenantId: string;
  /** O filtro da lista — o id dela com o escopo de quem vê. */
  where: Prisma.PipelineWhereInput;
  limiteDeConcluidas: number;
}): Promise<Quadro | null> {
  const prisma = getPrisma();
  const pipeline = await lerLista({ ...where, tenantId });
  if (!pipeline) return null;
  const pipelineId = pipeline.id;

  const terminais = pipeline.stages.filter((s) => s.isTerminal).map((s) => s.id);
  const abertas = pipeline.stages.filter((s) => !s.isTerminal).map((s) => s.id);
  const doTopo = { tenantId, pipelineId, parentItemId: null };

  const [abertosDoTopo, porColunaConcluida, totais, subatividadesAbertas] = await Promise.all([
    prisma.pipelineItem.findMany({ where: { ...doTopo, stageId: { in: abertas } }, include: INCLUDE_DO_ITEM }),
    Promise.all(
      terminais.map((stageId) =>
        prisma.pipelineItem.findMany({
          where: { ...doTopo, stageId },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          // Uma a mais diz se há outras sem depender só da contagem.
          take: limiteDeConcluidas + 1,
          include: INCLUDE_DO_ITEM,
        })
      )
    ),
    terminais.length > 0
      ? prisma.pipelineItem.groupBy({ by: ["stageId"], where: { ...doTopo, stageId: { in: terminais } }, _count: { _all: true } })
      : Promise.resolve([] as { stageId: string; _count: { _all: number } }[]),
    // As subatividades abertas da lista: o pai de topo delas fica no quadro
    // mesmo concluído e antigo.
    abertas.length > 0
      ? prisma.pipelineItem.findMany({
          where: { tenantId, pipelineId, parentItemId: { not: null }, stageId: { in: abertas } },
          select: { id: true, parentItemId: true },
        })
      : Promise.resolve([] as { id: string; parentItemId: string | null }[]),
  ]);

  const doTopoCarregados = [...abertosDoTopo, ...porColunaConcluida.flatMap((lista) => lista.slice(0, limiteDeConcluidas))];
  const carregados = new Set(doTopoCarregados.map((i) => i.id));

  // Sobe de cada subatividade aberta até a atividade de topo dela. O pai de
  // quem já se conhece não volta ao banco; o resto sobe um nível por leitura.
  const paiDe = new Map<string, string | null>();
  for (const i of doTopoCarregados) paiDe.set(i.id, null);
  for (const s of subatividadesAbertas) paiDe.set(s.id, s.parentItemId);
  for (let nivel = 0; nivel < PROFUNDIDADE_MAXIMA; nivel++) {
    const faltam = [...new Set([...paiDe.values()].filter((p): p is string => p !== null && !paiDe.has(p)))];
    if (faltam.length === 0) break;
    const pais = await prisma.pipelineItem.findMany({ where: { tenantId, id: { in: faltam } }, select: { id: true, parentItemId: true } });
    for (const p of pais) paiDe.set(p.id, p.parentItemId);
    // Pai que não veio (dado quebrado): marca como raiz para não pedir de novo.
    for (const id of faltam) if (!paiDe.has(id)) paiDe.set(id, null);
  }
  const raizes = new Set<string>();
  for (const s of subatividadesAbertas) {
    let atual = s.id;
    const vistos = new Set<string>();
    while (paiDe.get(atual) && !vistos.has(atual)) {
      vistos.add(atual);
      atual = paiDe.get(atual)!;
    }
    if (paiDe.get(atual) === null && !carregados.has(atual)) raizes.add(atual);
  }
  const paisConcluidos =
    raizes.size > 0
      ? await prisma.pipelineItem.findMany({ where: { ...doTopo, id: { in: [...raizes] } }, include: INCLUDE_DO_ITEM })
      : [];

  const topo = [...doTopoCarregados, ...paisConcluidos];
  const idsDoTopo = topo.map((i) => i.id);

  // As subatividades, nível a nível, só abaixo do que veio.
  const itens: ItemDoQuadro[] = [...topo];
  let nivel = idsDoTopo;
  for (let n = 0; n < PROFUNDIDADE_MAXIMA && nivel.length > 0; n++) {
    const filhas = await prisma.pipelineItem.findMany({ where: { tenantId, parentItemId: { in: nivel } }, include: INCLUDE_DO_ITEM });
    itens.push(...filhas);
    nivel = filhas.map((f) => f.id);
  }

  const concluidas: Record<string, ResumoDaConcluida> = {};
  for (const stageId of terminais) {
    concluidas[stageId] = {
      total: totais.find((t) => t.stageId === stageId)?._count._all ?? 0,
      mostradas: topo.filter((i) => i.stageId === stageId).length,
    };
  }

  const ultimaMudancaDeEtapa: Record<string, Date> = {};
  const ultimaAtividade: Record<string, string> = {};
  const criador: Record<string, { id: string; name: string }> = {};
  if (idsDoTopo.length > 0) {
    const doItem = { tenantId, pipelineItemId: { in: idsDoTopo } };
    const [mudancas, ultimas, criacoes] = await Promise.all([
      prisma.activity.groupBy({ by: ["pipelineItemId"], where: { ...doItem, type: "STATUS_CHANGE" }, _max: { createdAt: true } }),
      prisma.activity.groupBy({ by: ["pipelineItemId"], where: doItem, _max: { createdAt: true } }),
      prisma.activity.findMany({ where: { ...doItem, type: "CREATED" }, select: { pipelineItemId: true, user: { select: { id: true, name: true } } } }),
    ]);
    for (const m of mudancas) if (m._max.createdAt) ultimaMudancaDeEtapa[m.pipelineItemId] = m._max.createdAt;
    for (const c of criacoes) criador[c.pipelineItemId] = c.user;

    // A última de cada item: o instante veio do groupBy, a linha vem agora —
    // só as atividades daqueles instantes, não o histórico inteiro.
    const instante = new Map(ultimas.filter((u) => u._max.createdAt).map((u) => [u.pipelineItemId, u._max.createdAt!.getTime()]));
    const datas = [...new Set(instante.values())].map((t) => new Date(t));
    if (datas.length > 0) {
      const linhas = await prisma.activity.findMany({
        where: { ...doItem, createdAt: { in: datas } },
        select: { pipelineItemId: true, createdAt: true, type: true, content: true },
      });
      for (const a of linhas) {
        if (a.pipelineItemId in ultimaAtividade || instante.get(a.pipelineItemId) !== a.createdAt.getTime()) continue;
        ultimaAtividade[a.pipelineItemId] = a.content?.trim() ? a.content : (ROTULO_DA_ATIVIDADE[a.type] ?? a.type);
      }
    }
  }

  return { pipeline, itens, concluidas, ultimaMudancaDeEtapa, ultimaAtividade, criador };
}
