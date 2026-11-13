// As contas das atividades da Home, feitas no banco (13/11/2026, melhoria-662).
//
// A Home lia toda atividade (card) em aberto do alcance da pessoa, com coluna,
// quadro e responsáveis, e todas as atividades do histórico de 14 dias, só
// para contar em JS: atrasadas, de hoje, por setor, por coluna, por dia. Com
// os quadros do escritório inteiro, isso crescia sem teto a cada abertura da
// primeira tela do dia. Aqui as contas são `count`/`groupBy`, e só os oito
// itens do "Meu dia" vêm como linha.

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import type { AuthContext } from "@/lib/auth/context";
import type { FaixaDaTarefa } from "@/lib/home/paineis";

const COR_PADRAO = "#586577";

/** Os cards em aberto do alcance — a mesma condição de antes. */
function emAberto(ctx: AuthContext) {
  return { tenantId: ctx.tenantId, pipeline: scopedPipelineWhere(ctx), stage: { isTerminal: false } } satisfies Prisma.PipelineItemWhereInput;
}

export type ColunaDoGrafico = { key: string; label: string; sublabel: string; value: number; color: string };

export type ContagemDasTarefas = {
  /** Todos os cards em aberto do alcance. */
  total: number;
  /** As faixas do painel "Atividades por prazo" (mesmas de `contarTarefas`). */
  porFaixa: Record<FaixaDaTarefa, number>;
  /** Em aberto e atribuídas a quem vê. */
  atribuidas: number;
  /** Por setor do quadro: em aberto e atrasadas. */
  porSetor: Map<string, { abertas: number; atrasadas: number }>;
  /** Por quadro e nome de coluna, do maior para o menor (o gráfico mostra os 5 primeiros). */
  colunas: ColunaDoGrafico[];
};

export async function contarTarefasDaHome(ctx: AuthContext, inicioDeHoje: Date, fimDeHoje: Date): Promise<ContagemDasTarefas> {
  const prisma = getPrisma();
  const onde = emAberto(ctx);
  const [porColuna, atrasadasPorQuadro, hoje, semPrazo, atribuidas] = await Promise.all([
    prisma.pipelineItem.groupBy({ by: ["pipelineId", "stageId"], where: onde, _count: { _all: true } }),
    prisma.pipelineItem.groupBy({ by: ["pipelineId"], where: { ...onde, dueDate: { lt: inicioDeHoje } }, _count: { _all: true } }),
    prisma.pipelineItem.count({ where: { ...onde, dueDate: { gte: inicioDeHoje, lte: fimDeHoje } } }),
    prisma.pipelineItem.count({ where: { ...onde, dueDate: null } }),
    ctx.userId ? prisma.pipelineItem.count({ where: { ...onde, assignees: { some: { userId: ctx.userId } } } }) : Promise.resolve(0),
  ]);

  const idsDosQuadros = [...new Set(porColuna.map((g) => g.pipelineId))];
  const idsDasColunas = [...new Set(porColuna.map((g) => g.stageId))];
  const [quadros, colunasDoQuadro] = await Promise.all([
    idsDosQuadros.length ? prisma.pipeline.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsDosQuadros } }, select: { id: true, name: true, sectorCode: true } }) : [],
    idsDasColunas.length ? prisma.pipelineStage.findMany({ where: { id: { in: idsDasColunas } }, select: { id: true, name: true, color: true } }) : [],
  ]);
  const quadro = new Map(quadros.map((q) => [q.id, q]));
  const coluna = new Map(colunasDoQuadro.map((c) => [c.id, c]));

  const porSetor = new Map<string, { abertas: number; atrasadas: number }>();
  const doSetor = (pipelineId: string) => {
    const setor = quadro.get(pipelineId)?.sectorCode ?? "";
    let s = porSetor.get(setor);
    if (!s) porSetor.set(setor, (s = { abertas: 0, atrasadas: 0 }));
    return s;
  };
  // O gráfico agrupa por (quadro, NOME da coluna), como antes: duas colunas
  // de mesmo nome no mesmo quadro somam numa barra.
  const barras = new Map<string, ColunaDoGrafico>();
  let total = 0;
  for (const g of porColuna) {
    const n = g._count._all;
    total += n;
    doSetor(g.pipelineId).abertas += n;
    const c = coluna.get(g.stageId);
    const nome = c?.name ?? "—";
    const key = `${g.pipelineId}::${nome}`;
    const antes = barras.get(key);
    barras.set(key, { key, label: nome, sublabel: quadro.get(g.pipelineId)?.name ?? "—", value: (antes?.value ?? 0) + n, color: c?.color ?? COR_PADRAO });
  }
  let atrasada = 0;
  for (const g of atrasadasPorQuadro) {
    atrasada += g._count._all;
    doSetor(g.pipelineId).atrasadas += g._count._all;
  }

  return {
    total,
    porFaixa: { atrasada, hoje, sem_prazo: semPrazo, adiante: total - atrasada - hoje - semPrazo },
    atribuidas,
    porSetor,
    colunas: [...barras.values()].sort((a, b) => b.value - a.value),
  };
}

const CAMPOS_DO_MEU_DIA = {
  id: true,
  number: true,
  entityId: true,
  entityType: true,
  title: true,
  dueDate: true,
  createdAt: true,
  pipelineId: true,
  stage: { select: { name: true, color: true } },
  pipeline: { select: { name: true, sectorCode: true } },
  assignees: { select: { userId: true } },
} satisfies Prisma.PipelineItemSelect;

export type ItemDoMeuDia = Prisma.PipelineItemGetPayload<{ select: typeof CAMPOS_DO_MEU_DIA }>;

/**
 * O "Meu dia" da Home: os atribuídos a quem vê e todo card com prazo no
 * alcance — prazo mais perto primeiro (no mesmo prazo, os da pessoa antes),
 * depois os atribuídos sem prazo, do mais novo ao mais antigo. Os primeiros
 * `limite` vêm de três consultas ordenadas, de no máximo `limite` linhas cada:
 * os da pessoa com prazo, todos com prazo e os da pessoa sem prazo.
 */
export async function tarefasDoMeuDia(ctx: AuthContext, limite = 8): Promise<ItemDoMeuDia[]> {
  const prisma = getPrisma();
  const onde = emAberto(ctx);
  const daPessoa = ctx.userId ? { assignees: { some: { userId: ctx.userId } } } : null;
  const porPrazo = [{ dueDate: "asc" as const }, { id: "asc" as const }];
  const [minhasComPrazo, todasComPrazo, minhasSemPrazo] = await Promise.all([
    daPessoa ? prisma.pipelineItem.findMany({ where: { ...onde, ...daPessoa, dueDate: { not: null } }, orderBy: porPrazo, take: limite, select: CAMPOS_DO_MEU_DIA }) : [],
    prisma.pipelineItem.findMany({ where: { ...onde, dueDate: { not: null } }, orderBy: porPrazo, take: limite, select: CAMPOS_DO_MEU_DIA }),
    daPessoa
      ? prisma.pipelineItem.findMany({ where: { ...onde, ...daPessoa, dueDate: null }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limite, select: CAMPOS_DO_MEU_DIA })
      : [],
  ]);
  const minha = (i: ItemDoMeuDia) => !!ctx.userId && i.assignees.some((a) => a.userId === ctx.userId);
  const comPrazo = [...new Map([...minhasComPrazo, ...todasComPrazo].map((i) => [i.id, i])).values()].sort(
    (a, b) => a.dueDate!.getTime() - b.dueDate!.getTime() || Number(minha(b)) - Number(minha(a))
  );
  return [...comPrazo, ...minhasSemPrazo].slice(0, limite);
}

/**
 * Quantas atividades do histórico dos cards do alcance houve por dia (de São
 * Paulo, "dd/mm"), desde `desde` — contadas no banco, numa consulta só. O
 * Brasil não tem horário de verão desde 2019: o dia de São Paulo é UTC−3.
 */
export async function atividadesPorDia(ctx: AuthContext, desde: Date): Promise<Map<string, number>> {
  const prisma = getPrisma();
  // Os quadros do alcance pela mesma regra do resto da tela (`scopedPipelineWhere`).
  const quadros = (await prisma.pipeline.findMany({ where: scopedPipelineWhere(ctx), select: { id: true } })).map((q) => q.id);
  if (quadros.length === 0) return new Map();
  const linhas = await prisma.$queryRaw<{ dia: string; n: bigint | number }[]>`
    SELECT DATE_FORMAT(DATE_SUB(a.createdAt, INTERVAL 3 HOUR), '%d/%m') AS dia, COUNT(*) AS n
    FROM activities a
    JOIN pipeline_items pi ON pi.id = a.pipelineItemId
    WHERE a.tenantId = ${ctx.tenantId} AND a.createdAt >= ${desde} AND pi.pipelineId IN (${Prisma.join(quadros)})
    GROUP BY dia`;
  return new Map(linhas.map((l) => [l.dia, Number(l.n)]));
}
