// O cartão do processo societário nos Quadros (27/11/2026, funcionalidade-844):
// a leitura e a gravação. A regra (colunas, o que o processo manda, os textos)
// mora em `cartaoDoProcesso.ts`; a escolha da lista, em `aberturaAutomatica.ts`.
//
// Mão única, processo → cartão. `sincronizarCartaoDoProcesso` roda no fim das
// ações que mexem no processo (abertura, etapas, protocolos, situação,
// responsável, prioridade, encerramento) e a reconciliação do agendador interno
// (`reconciliarCartoesDosProcessos`, a cada 15 min) faz a carga inicial e pega
// o que um gancho perder. As duas são idempotentes: o cartão é um só por
// processo (`processId` único) e só se grava o que difere.
//
// Nada aqui derruba quem chamou: o processo já está gravado quando o cartão
// anda, e a falha fica no log.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { criarComNumero } from "@/lib/enderecoCurtoNumeracao";
import { enderecoDaTarefa, segmentoDaTarefa } from "@/lib/enderecoCurto";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { nomeExibicao } from "@/lib/companyName";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { boardPath } from "@/lib/kanbanPaths";
import { STATUS_ENCERRADOS } from "@/lib/societario/processo";
import type { Prisma } from "@/generated/prisma/client";
import {
  COLUNAS_DO_PROCESSO,
  ajusteDoCartao,
  ajusteVazio,
  chaveDaColuna,
  colunaDeEntrada,
  descricaoDoCartao,
  destinoDoCartao,
  movimentoDoCartao,
  prioridadeDoCartao,
  tituloDoCartao,
  type MovimentoDoCartao,
} from "./cartaoDoProcesso";
import {
  COR_DO_ESPACO_DOS_PROCESSOS,
  ESPACO_DOS_PROCESSOS,
  LISTA_DOS_PROCESSOS,
  NOME_ALTERNATIVO_DO_ESPACO,
  NOME_DA_LISTA_DOS_PROCESSOS,
  NOME_DO_ESPACO_DOS_PROCESSOS,
  destinoDaAbertura,
} from "./aberturaAutomatica";

export const MODULO_DOS_PROCESSOS = "societario_processos";

/** Quantos processos sem cartão a reconciliação cria por escritório a cada passada. */
const LOTE_DA_CARGA = 200;

function revalidar(pipelineId: string, itemId: string) {
  // Fora de uma requisição (o agendador), não há o que revalidar: a próxima
  // abertura do quadro já lê do banco.
  try {
    const base = boardPath({ id: pipelineId });
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  } catch {
    /* sem requisição */
  }
}

// ─── A lista padrão, criada sob demanda ──────────────────────────────────────

/**
 * A lista padrão dos processos no setor — o espaço "Processos" › a lista
 * "Processos societários", com uma coluna por situação —, criada na primeira
 * vez que alguém precisa dela. Duas chamadas ao mesmo tempo esbarram nos
 * índices únicos de `systemKey` e a segunda relê o que a primeira criou.
 */
export async function garantirListaDosProcessos(tenantId: string, sectorCode: string): Promise<string> {
  const prisma = getPrisma();
  const existente = await prisma.pipeline.findFirst({
    where: { tenantId, sectorCode, systemKey: LISTA_DOS_PROCESSOS },
    select: { id: true },
  });
  if (existente) return existente.id;

  const espacoId = await garantirEspacoDosProcessos(tenantId, sectorCode);
  try {
    const lista = await prisma.pipeline.create({
      data: {
        tenantId,
        sectorCode,
        spaceId: espacoId,
        name: NOME_DA_LISTA_DOS_PROCESSOS,
        description: "Criada pelo sistema: cada processo societário vira um cartão aqui, na coluna da situação dele.",
        entityType: "COMPANY",
        systemKey: LISTA_DOS_PROCESSOS,
        stages: {
          create: COLUNAS_DO_PROCESSO.map((c, order) => ({
            name: c.nome,
            order,
            color: c.cor,
            type: c.tipo,
            isTerminal: c.tipo === "DONE",
            systemKey: c.chave,
          })),
        },
      },
      select: { id: true },
    });
    return lista.id;
  } catch (err) {
    if (!isPrismaUniqueError(err)) throw err;
    const outra = await prisma.pipeline.findFirst({ where: { tenantId, sectorCode, systemKey: LISTA_DOS_PROCESSOS }, select: { id: true } });
    if (!outra) throw err;
    return outra.id;
  }
}

async function garantirEspacoDosProcessos(tenantId: string, sectorCode: string): Promise<string> {
  const prisma = getPrisma();
  const ler = () => prisma.space.findFirst({ where: { tenantId, sectorCode, systemKey: ESPACO_DOS_PROCESSOS }, select: { id: true } });
  const existente = await ler();
  if (existente) return existente.id;

  // O nome é único no setor: se a equipe já tem um espaço "Processos", o do
  // sistema nasce com o nome alternativo (e pode ser renomeado depois).
  for (const name of [NOME_DO_ESPACO_DOS_PROCESSOS, NOME_ALTERNATIVO_DO_ESPACO]) {
    try {
      const espaco = await prisma.space.create({
        data: { tenantId, sectorCode, name, color: COR_DO_ESPACO_DOS_PROCESSOS, icon: null, systemKey: ESPACO_DOS_PROCESSOS, order: -1 },
        select: { id: true },
      });
      return espaco.id;
    } catch (err) {
      if (!isPrismaUniqueError(err)) throw err;
      const criadoAoMesmoTempo = await ler();
      if (criadoAoMesmoTempo) return criadoAoMesmoTempo.id;
      // Esbarrou no nome: tenta o alternativo.
    }
  }
  throw new Error(`[processos-no-quadro] o setor ${sectorCode} já tem espaços "${NOME_DO_ESPACO_DOS_PROCESSOS}" e "${NOME_ALTERNATIVO_DO_ESPACO}"`);
}

/**
 * A lista onde o processo novo vira cartão no escritório, ou `null` (a abertura
 * do setor está desligada, ou o módulo não tem setor). A lista escolhida que
 * ficou inativa ou de outro setor cai na padrão — o processo não fica sem cartão
 * por uma lista que saiu de uso.
 */
export async function listaDeDestino(tenantId: string): Promise<string | null> {
  const sectorCode = await setorDoModulo(tenantId, MODULO_DOS_PROCESSOS);
  if (!sectorCode) return null;
  const prisma = getPrisma();
  const config = await prisma.aberturaAutomatica.findUnique({
    where: { tenantId_sectorCode_origem: { tenantId, sectorCode, origem: "PROCESSO_SOCIETARIO" } },
    select: { ativo: true, pipelineId: true },
  });
  const destino = destinoDaAbertura(config);
  if (!destino.ligada) return null;
  if (destino.lista.tipo === "escolhida") {
    const escolhida = await prisma.pipeline.findFirst({
      where: { id: destino.lista.pipelineId, tenantId, sectorCode, active: true, entityType: "COMPANY" },
      select: { id: true },
    });
    if (escolhida) return escolhida.id;
  }
  return garantirListaDosProcessos(tenantId, sectorCode);
}

/**
 * A lista onde os processos do escritório viram cartão hoje, para o atalho do
 * kanban de processos — sem criar nada: a escolhida pelo setor, ou a padrão se
 * já existe. `null` quando não há nenhuma ainda.
 */
export async function listaDosProcessosParaVer(tenantId: string): Promise<{ id: string; sectorCode: string } | null> {
  const sectorCode = await setorDoModulo(tenantId, MODULO_DOS_PROCESSOS);
  if (!sectorCode) return null;
  const prisma = getPrisma();
  const config = await prisma.aberturaAutomatica.findUnique({
    where: { tenantId_sectorCode_origem: { tenantId, sectorCode, origem: "PROCESSO_SOCIETARIO" } },
    select: { pipelineId: true },
  });
  const escolhida = config?.pipelineId
    ? await prisma.pipeline.findFirst({ where: { id: config.pipelineId, tenantId, active: true }, select: { id: true, sectorCode: true } })
    : null;
  return escolhida ?? (await prisma.pipeline.findFirst({ where: { tenantId, sectorCode, systemKey: LISTA_DOS_PROCESSOS }, select: { id: true, sectorCode: true } }));
}

// ─── A sincronia ─────────────────────────────────────────────────────────────

const SELECT_DO_PROCESSO = {
  id: true,
  tenantId: true,
  number: true,
  companyId: true,
  title: true,
  status: true,
  priority: true,
  ownerUserId: true,
  concludedAt: true,
  type: { select: { name: true } },
  company: { select: { name: true, displayName: true } },
  protocols: { select: { organId: true, attempt: true, outcome: true } },
  cartao: {
    select: {
      id: true,
      pipelineId: true,
      stageId: true,
      title: true,
      priority: true,
      entityId: true,
      stage: { select: { name: true } },
      assignees: { select: { userId: true } },
      pipeline: { select: { stages: { select: { id: true, name: true, order: true, type: true, systemKey: true } } } },
    },
  },
} satisfies Prisma.ProcessSelect;

type ProcessoDoCartao = Prisma.ProcessGetPayload<{ select: typeof SELECT_DO_PROCESSO }>;

function chaveDo(p: ProcessoDoCartao) {
  return chaveDaColuna({ status: p.status, concluido: p.concludedAt !== null, protocolos: p.protocols });
}

/**
 * Cria ou ajusta o cartão do processo. `userId`, quando a equipe agiu: a
 * mudança de coluna entra no histórico do cartão em nome dela. Sem ele (o
 * agendador, o robô), o cartão só muda de coluna — o histórico exige um autor.
 *
 * `destino` serve à reconciliação, que lê a lista do escritório uma vez só.
 */
export async function sincronizarCartaoDoProcesso(
  processId: string,
  opcoes: { userId?: string | null; destino?: string | null } = {}
): Promise<void> {
  let p: ProcessoDoCartao | null = null;
  try {
    p = await getPrisma().process.findUnique({ where: { id: processId }, select: SELECT_DO_PROCESSO });
  } catch (err) {
    console.error(`[processos-no-quadro] falha ao ler o processo ${processId}`, err);
  }
  if (p) await sincronizarLido(p, opcoes.userId ?? null, opcoes.destino);
}

async function sincronizarLido(p: ProcessoDoCartao, userId: string | null, destino: string | null | undefined): Promise<void> {
  try {
    if (p.cartao) await ajustarCartao(p, userId);
    else await criarCartao(p, destino === undefined ? await listaDeDestino(p.tenantId) : destino);
  } catch (err) {
    if (isPrismaUniqueError(err)) return; // outra chamada criou o cartão ao mesmo tempo
    console.error(`[processos-no-quadro] falha ao sincronizar o cartão do processo ${p.id}`, err);
  }
}

/** A sincronia de vários processos (a mesma de um), um por vez. */
export async function sincronizarCartoesDosProcessos(processIds: readonly string[], userId?: string | null): Promise<void> {
  for (const id of new Set(processIds)) await sincronizarCartaoDoProcesso(id, { userId });
}

async function criarCartao(p: ProcessoDoCartao, pipelineId: string | null): Promise<void> {
  if (!pipelineId) return; // abertura desligada no setor
  const prisma = getPrisma();
  const lista = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId: p.tenantId },
    select: { id: true, stages: { select: { id: true, order: true, type: true, systemKey: true } } },
  });
  if (!lista) return;
  const coluna = colunaDeEntrada(lista.stages, chaveDo(p));
  if (!coluna) {
    console.error(`[processos-no-quadro] lista ${lista.id} sem colunas — o processo ${p.id} ficou sem cartão`);
    return;
  }

  // O cartão é uma tarefa do quadro: ganha o número do escritório (tarefa-77).
  const item = await criarComNumero("tarefa", p.tenantId, (tx, number) =>
    tx.pipelineItem.create({
      data: {
        tenantId: p.tenantId,
        number,
        pipelineId: lista.id,
        stageId: coluna.id,
        entityType: "COMPANY",
        entityId: p.companyId,
        title: tituloDoCartao(p.number, p.type.name, nomeExibicao(p.company)),
        description: descricaoDoCartao(p.number, p.title),
        priority: prioridadeDoCartao(p.priority),
        processId: p.id,
        assignees: p.ownerUserId ? { create: [{ userId: p.ownerUserId }] } : undefined,
      },
      select: { id: true },
    })
  );
  revalidar(lista.id, item.id);
}

async function ajustarCartao(p: ProcessoDoCartao, userId: string | null): Promise<void> {
  const cartao = p.cartao!;
  const colunas = cartao.pipeline.stages;
  const destino = destinoDoCartao(colunas, cartao.stageId, chaveDo(p));
  const ajuste = ajusteDoCartao(
    {
      title: cartao.title,
      priority: cartao.priority,
      entityId: cartao.entityId,
      stageId: cartao.stageId,
      responsaveis: cartao.assignees.map((a) => a.userId),
    },
    {
      title: tituloDoCartao(p.number, p.type.name, nomeExibicao(p.company)),
      priority: prioridadeDoCartao(p.priority),
      entityId: p.companyId,
      stageId: destino?.id ?? null,
      responsavel: p.ownerUserId,
    }
  );
  if (ajusteVazio(ajuste)) return;

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    if (Object.keys(ajuste.dados).length > 0) await tx.pipelineItem.update({ where: { id: cartao.id }, data: ajuste.dados });
    if (ajuste.tirar.length > 0) await tx.pipelineItemAssignee.deleteMany({ where: { pipelineItemId: cartao.id, userId: { in: ajuste.tirar } } });
    for (const userIdNovo of ajuste.por) {
      await tx.pipelineItemAssignee.upsert({
        where: { pipelineItemId_userId: { pipelineItemId: cartao.id, userId: userIdNovo } },
        create: { pipelineItemId: cartao.id, userId: userIdNovo },
        update: {},
      });
    }
    if (destino && ajuste.dados.stageId && userId) {
      await tx.activity.create({
        data: {
          tenantId: p.tenantId,
          pipelineItemId: cartao.id,
          userId,
          type: "STATUS_CHANGE",
          content: `Movido de "${cartao.stage.name}" para "${destino.name}" pelo Processo nº ${p.number}`,
          metadata: { stageFrom: cartao.stageId, stageTo: destino.id, processId: p.id },
        },
      });
    }
  });
  revalidar(cartao.pipelineId, cartao.id);
}

// ─── A reconciliação do agendador ───────────────────────────────────────────

export type ResultadoDaReconciliacao = { escritorios: number; verificados: number };

/**
 * A cada 15 minutos (src/lib/alerts.ts): em cada escritório com os processos
 * ligados, cria o cartão do processo que ainda não tem (até `LOTE_DA_CARGA` por
 * passada — a carga inicial anda em lotes) e ajusta o de todo processo aberto
 * e o do encerrado cujo cartão ainda não chegou à coluna final.
 */
export async function reconciliarCartoesDosProcessos(): Promise<ResultadoDaReconciliacao> {
  const prisma = getPrisma();
  const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true } });
  let escritorios = 0;
  let verificados = 0;
  for (const t of tenants) {
    try {
      if (!(await isModuleEnabled(t.id, MODULO_DOS_PROCESSOS))) continue;
      escritorios++;
      // Lidos de uma vez, com o que a sincronia usa; a gravação é um por vez.
      const [semCartao, paraConferir] = await Promise.all([
        prisma.process.findMany({ where: { tenantId: t.id, cartao: { is: null } }, select: SELECT_DO_PROCESSO, orderBy: { startedAt: "desc" }, take: LOTE_DA_CARGA }),
        prisma.process.findMany({
          where: {
            tenantId: t.id,
            cartao: { isNot: null },
            OR: [{ status: { notIn: STATUS_ENCERRADOS } }, { cartao: { is: { stage: { isTerminal: false } } } }],
          },
          select: SELECT_DO_PROCESSO,
        }),
      ]);
      // A lista padrão nasce só quando há processo para pôr nela (sob demanda);
      // com a abertura desligada, `destino` é nulo e nenhum cartão novo nasce.
      const destino = semCartao.length > 0 ? await listaDeDestino(t.id) : null;
      if (destino) for (const p of semCartao) await sincronizarLido(p, null, destino);
      for (const p of paraConferir) await sincronizarLido(p, null, destino);
      verificados += (destino ? semCartao.length : 0) + paraConferir.length;
    } catch (err) {
      console.error(`[processos-no-quadro] falha na reconciliação do escritório ${t.id}`, err);
    }
  }
  return { escritorios, verificados };
}

// ─── O cartão, para as telas ────────────────────────────────────────────────

export type CartaoDoProcesso = {
  id: string;
  /** O endereço do quadro que abre o cartão por cima (`?abrir=`). */
  href: string;
  /** O endereço do cartão em página cheia. */
  hrefDoCartao: string;
  pipelineId: string;
  sectorCode: string;
};

/** O endereço do quadro com o cartão aberto em cima: a lista carrega e o modal do cartão abre. */
export function enderecoDoQuadroComCartao(pipelineId: string, item: { id: string; number: number }): string {
  return `${boardPath({ id: pipelineId })}?abrir=${encodeURIComponent(segmentoDaTarefa(item))}`;
}

/** Os cartões dos processos, por processo. Quem chama confere se a pessoa vê o setor da lista. */
export async function cartoesDosProcessos(tenantId: string, processIds: readonly string[]): Promise<Map<string, CartaoDoProcesso>> {
  if (processIds.length === 0) return new Map();
  const cartoes = await getPrisma().pipelineItem.findMany({
    where: { tenantId, processId: { in: [...processIds] } },
    select: { id: true, number: true, processId: true, pipeline: { select: { id: true, sectorCode: true } } },
  });
  return new Map(
    cartoes.map((c) => [
      c.processId!,
      {
        id: c.id,
        href: enderecoDoQuadroComCartao(c.pipeline.id, c),
        hrefDoCartao: enderecoDaTarefa(c.pipeline.id, c),
        pipelineId: c.pipeline.id,
        sectorCode: c.pipeline.sectorCode,
      },
    ])
  );
}

export async function cartaoDoProcesso(tenantId: string, processId: string): Promise<CartaoDoProcesso | null> {
  return (await cartoesDosProcessos(tenantId, [processId])).get(processId) ?? null;
}

/**
 * Antes de mover à mão o cartão de um processo para a coluna `paraStageId`:
 * só para outra coluna que também serve à situação atual (`movimentoDoCartao`).
 */
export async function conferirMovimentoDoCartaoDoProcesso(tenantId: string, processId: string, pipelineId: string, paraStageId: string): Promise<MovimentoDoCartao> {
  const prisma = getPrisma();
  const [p, colunas] = await Promise.all([
    prisma.process.findFirst({
      where: { id: processId, tenantId },
      select: { number: true, status: true, concludedAt: true, protocols: { select: { organId: true, attempt: true, outcome: true } } },
    }),
    prisma.pipelineStage.findMany({ where: { pipelineId }, select: { id: true, order: true, type: true, systemKey: true } }),
  ]);
  if (!p) return { ok: true }; // o processo saiu: o cartão ficou solto e anda livre
  return movimentoDoCartao(colunas, paraStageId, chaveDaColuna({ status: p.status, concluido: p.concludedAt !== null, protocolos: p.protocols }), p.number);
}
