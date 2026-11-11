// O cartão da solicitação no quadro do setor (09/11/2026): a leitura e a
// gravação. A regra (colunas, o que o movimento à mão faz, o texto) mora em
// `cartao.ts`.
//
// Criar e mover o cartão vem DEPOIS da solicitação gravada, e nunca derruba
// quem chamou: o cliente que abriu a solicitação não pode receber erro porque a
// lista do quadro foi apagada. A falha fica no log.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { criarComNumero } from "@/lib/enderecoCurtoNumeracao";
import { enderecoDaTarefa } from "@/lib/enderecoCurto";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { nomeExibicao } from "@/lib/companyName";
import { isModuleEnabled } from "@/lib/modules";
import { boardPath } from "@/lib/kanbanPaths";
import type { AuthContext } from "@/lib/auth/context";
import type { StageType } from "@/generated/prisma/enums";
import { podeAgirNaSolicitacao } from "./acesso";
import { transicao } from "./regras";
import { colunaDeEntrada, descricaoDoCartao, destinoDoCartao, movimentoDoCartao, tituloDoCartao, type ListaParaOAssunto } from "./cartao";

const MODULO = "portal_solicitacoes";

function revalidarCartao(pipelineId: string, itemId: string) {
  const base = boardPath({ id: pipelineId });
  revalidatePath(base);
  revalidatePath(`${base}/itens/${itemId}`);
}

/**
 * Cria o cartão da solicitação recém-aberta, se o assunto dela pede. Um só por
 * solicitação: a segunda chamada acha o cartão e não faz nada, e duas ao mesmo
 * tempo esbarram no índice único de `serviceRequestId`.
 *
 * O cartão nasce na primeira coluna "não iniciada", com a empresa, o
 * responsável da solicitação (o da empresa no setor, se houver) e o texto do
 * cliente. Sem prazo: o prazo da solicitação é o da primeira resposta, e depois
 * dela o cartão ficaria "atrasado" sem estar.
 */
export async function criarCartaoDaSolicitacao(tenantId: string, requestId: string): Promise<void> {
  const prisma = getPrisma();
  try {
    const s = await prisma.serviceRequest.findFirst({
      where: { id: requestId, tenantId },
      select: {
        id: true,
        number: true,
        companyId: true,
        assigneeId: true,
        description: true,
        subject: { select: { label: true, cardPipelineId: true } },
        company: { select: { name: true, displayName: true } },
        cartao: { select: { id: true } },
      },
    });
    if (!s || !s.subject.cardPipelineId || s.cartao) return;

    // Lista desativada não recebe cartão: a equipe tirou ela de uso.
    const lista = await prisma.pipeline.findFirst({
      where: { id: s.subject.cardPipelineId, tenantId, active: true },
      select: { id: true, stages: { select: { id: true, order: true, type: true } } },
    });
    if (!lista) return;
    const coluna = colunaDeEntrada(lista.stages);
    if (!coluna) {
      console.error(`[solicitacoes] lista ${lista.id} sem colunas — a solicitação ${s.id} ficou sem cartão`);
      return;
    }

    // O cartão é uma tarefa do quadro: ganha o número do escritório, o do
    // endereço curto /kanban/itens/tarefa-77 (10/11/2026, pedido do Kauan).
    const item = await criarComNumero("tarefa", tenantId, (tx, number) => tx.pipelineItem.create({
      data: {
        tenantId,
        number,
        pipelineId: lista.id,
        stageId: coluna.id,
        entityType: "COMPANY",
        entityId: s.companyId,
        title: tituloDoCartao(s.subject.label, nomeExibicao(s.company)),
        description: descricaoDoCartao(s.number, s.description),
        serviceRequestId: s.id,
        assignees: s.assigneeId ? { create: [{ userId: s.assigneeId }] } : undefined,
      },
      select: { id: true },
    }));
    revalidarCartao(lista.id, item.id);
  } catch (err) {
    if (isPrismaUniqueError(err)) return; // outra chamada criou o cartão ao mesmo tempo
    console.error(`[solicitacoes] falha ao criar o cartão da solicitação ${requestId}`, err);
  }
}

/**
 * Leva o cartão para a coluna do status atual da solicitação — lido aqui, do
 * banco, e não de quem chamou. Sem cartão, já numa coluna do tipo certo, ou sem
 * coluna desse tipo na lista: fica onde está.
 *
 * Com `userId` (a equipe agiu), o movimento entra no histórico do cartão em
 * nome dela. Quando quem agiu foi o cliente, não há usuário do escritório para
 * assinar — o histórico exige um —, e o cartão só muda de coluna.
 */
export async function moverCartaoDaSolicitacao(tenantId: string, requestId: string, userId: string | null): Promise<void> {
  const prisma = getPrisma();
  try {
    const cartao = await prisma.pipelineItem.findFirst({
      where: { tenantId, serviceRequestId: requestId },
      select: {
        id: true,
        pipelineId: true,
        stageId: true,
        stage: { select: { name: true } },
        serviceRequest: { select: { number: true, status: true } },
        pipeline: { select: { stages: { select: { id: true, name: true, order: true, type: true } } } },
      },
    });
    if (!cartao?.serviceRequest) return;
    const destino = destinoDoCartao(cartao.pipeline.stages, cartao.stageId, cartao.serviceRequest.status);
    if (!destino) return;

    await prisma.pipelineItem.update({ where: { id: cartao.id }, data: { stageId: destino.id } });
    if (userId) {
      await prisma.activity.create({
        data: {
          tenantId,
          pipelineItemId: cartao.id,
          userId,
          type: "STATUS_CHANGE",
          content: `Movido de "${cartao.stage.name}" para "${destino.name}" pela Solicitação nº ${cartao.serviceRequest.number}`,
          metadata: { stageFrom: cartao.stageId, stageTo: destino.id, serviceRequestId: requestId },
        },
      });
    }
    revalidarCartao(cartao.pipelineId, cartao.id);
  } catch (err) {
    console.error(`[solicitacoes] falha ao mover o cartão da solicitação ${requestId}`, err);
  }
}

export type CartaoDaSolicitacao = {
  id: string;
  href: string;
  /** "Espaço › Lista" — onde o cartão mora. */
  lista: string;
  coluna: string;
  colunaTipo: StageType;
  sectorCode: string;
};

/** O cartão da solicitação, para a tela dela. Quem chama confere se a pessoa vê o setor da lista. */
export async function cartaoDaSolicitacao(tenantId: string, requestId: string): Promise<CartaoDaSolicitacao | null> {
  const c = await getPrisma().pipelineItem.findFirst({
    where: { tenantId, serviceRequestId: requestId },
    select: {
      id: true,
      number: true,
      stage: { select: { name: true, type: true } },
      pipeline: { select: { id: true, name: true, sectorCode: true, space: { select: { name: true } } } },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    href: enderecoDaTarefa(c.pipeline.id, c),
    lista: `${c.pipeline.space.name} › ${c.pipeline.name}`,
    coluna: c.stage.name,
    colunaTipo: c.stage.type,
    sectorCode: c.pipeline.sectorCode,
  };
}

export type ConferenciaDoMovimento = { ok: true; concluir: boolean } | { ok: false; erro: string };

/**
 * Antes de mover à mão o cartão de uma solicitação para uma coluna do tipo
 * `para`: pode, e conclui a solicitação junto? As regras do "Concluir" da
 * solicitação, conferidas antes de o cartão sair do lugar — o módulo ligado,
 * quem pode agir nela (o setor que a atende agora, ou o responsável) e a
 * transição. A conclusão em si é a da própria solicitação (`concluirSolicitacao`),
 * com o aviso ao cliente e a auditoria.
 */
export async function conferirMovimentoDoCartao(ctx: AuthContext, requestId: string, para: StageType): Promise<ConferenciaDoMovimento> {
  const s = await getPrisma().serviceRequest.findFirst({
    where: { id: requestId, tenantId: ctx.tenantId },
    select: { number: true, status: true, sectorCode: true, assigneeId: true },
  });
  if (!s) return { ok: true, concluir: false };

  const m = movimentoDoCartao({ numero: s.number, status: s.status }, para);
  if (!m.ok) return { ok: false, erro: m.motivo };
  if (!m.concluir) return m;

  const deQuem = `Este cartão acompanha a Solicitação nº ${s.number}`;
  if (!(await isModuleEnabled(ctx.tenantId, MODULO))) {
    return { ok: false, erro: `${deQuem}, e as solicitações estão desligadas: não dá para concluí-la por aqui.` };
  }
  if (!podeAgirNaSolicitacao(ctx, s)) {
    return { ok: false, erro: `${deQuem}, que está com outro setor: quem a conclui é quem a atende agora.` };
  }
  const t = transicao(s.status, "EQUIPE", "CONCLUIR");
  if (!t.ok) return { ok: false, erro: t.motivo };
  return { ok: true, concluir: true };
}

/**
 * As listas ativas dos Quadros, para o assunto escolher onde a solicitação vira
 * cartão. Todas as do escritório: a tela filtra pelo setor escolhido no
 * formulário, que muda sem recarregar.
 */
export async function listasParaOsAssuntos(tenantId: string): Promise<ListaParaOAssunto[]> {
  const listas = await getPrisma().pipeline.findMany({
    where: { tenantId, active: true },
    orderBy: [{ space: { order: "asc" } }, { space: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, sectorCode: true, space: { select: { name: true } }, folder: { select: { name: true } } },
  });
  return listas.map((l) => ({
    id: l.id,
    setor: l.sectorCode,
    espaco: l.space.name,
    nome: l.folder ? `${l.folder.name} › ${l.name}` : l.name,
  }));
}

/**
 * A lista escolhida para o assunto, conferida: do escritório, ativa e do setor
 * que atende o assunto. `null` = não vira cartão; `undefined` = a escolha não
 * vale (lista de outro setor ou que não existe mais).
 */
export async function listaDoAssunto(tenantId: string, cardPipelineId: string, sectorCode: string): Promise<string | null | undefined> {
  if (!cardPipelineId) return null;
  const lista = await getPrisma().pipeline.findFirst({
    where: { id: cardPipelineId, tenantId, active: true, sectorCode },
    select: { id: true },
  });
  return lista?.id;
}
