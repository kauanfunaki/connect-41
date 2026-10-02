// "O que o pessoal fez hoje?" — a ferramenta de atividade da equipe do chat
// (02/10/2026). Só leitura.
//
// Exemplo do Kauan: o coordenador pede um resumo do que a equipe fez no dia, e
// a resposta mostra cada pessoa com a foto. Os dois painéis que já existiam
// (Gestão e Meu dia) olham para o que FALTA fazer; esta junta o que foi FEITO.
//
// ─── Quem vê ─────────────────────────────────────────────────────────────────
//
// O recorte da Gestão (`recorteDaGestao`): diretoria e admin veem tudo,
// coordenador vê os setores dele, funcionário comum não vê. E só no setor do
// agente — a IA do DP fala da equipe do DP. Quem abre o chat calcula e manda
// em `escopo.equipe` (ver `escopoDoAgente`); vazio, a ferramenta recusa. O
// modelo não tem como alargar: o recorte não é parâmetro.

import { getPrisma } from "@/lib/prisma";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { itensDaGestao } from "@/lib/gestao/itens";
import { saoPauloParts, addDaysToKey } from "@/lib/agenda";

const MAX_PESSOAS = 40;

/** O dia pedido como chave "AAAA-MM-DD" de São Paulo: hoje, ontem ou a data. */
export function diaPedido(arg: unknown, agora: Date): string {
  const hoje = saoPauloParts(agora).dateKey;
  if (arg === "ontem") return addDaysToKey(hoje, -1);
  if (typeof arg === "string" && /^\d{4}-\d{2}-\d{2}$/.test(arg) && arg <= hoje) return arg;
  return hoje;
}

/** Os limites do dia em São Paulo (UTC-3, sem horário de verão), como instantes. */
export function limitesDoDia(dia: string): { inicio: Date; fim: Date } {
  const inicio = new Date(`${dia}T03:00:00.000Z`);
  return { inicio, fim: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
}

function setoresDaEquipeNoEscopo(ctx: ContextoDaFerramenta): string[] {
  return (ctx.escopo.equipe ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export const FERRAMENTAS_DA_EQUIPE: Record<string, FerramentaRegistrada> = {
  atividade_da_equipe: {
    def: {
      nome: "atividade_da_equipe",
      descricao:
        "O que cada pessoa da equipe do seu setor fez num dia (hoje, ontem ou uma data): cards movidos e comentados, etapas de processo concluídas, transferências enviadas, itens concluídos e o que está parado com ela. Só para a coordenação e a diretoria. Cite cada pessoa como @[Nome](usuario:id), com o id que veio aqui.",
      parametros: {
        type: "object",
        properties: {
          dia: { type: "string", description: "\"hoje\", \"ontem\" ou uma data AAAA-MM-DD" },
          pessoa: { type: "string", description: "Parte do nome, para ver uma pessoa só, ou \"\" para a equipe toda" },
        },
        required: ["dia", "pessoa"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const setores = setoresDaEquipeNoEscopo(ctx);
      if (setores.length === 0) {
        throw new Error("A atividade da equipe é só para a coordenação do setor e a diretoria, com o painel da Gestão ligado.");
      }
      const dia = diaPedido(args.dia, new Date());
      const { inicio, fim } = limitesDoDia(dia);
      const nome = typeof args.pessoa === "string" ? args.pessoa.trim().slice(0, 60) : "";
      const prisma = getPrisma();

      const pessoas = await prisma.user.findMany({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          sectors: { some: { sectorCode: { in: setores } } },
          ...(nome ? { name: { contains: nome } } : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: MAX_PESSOAS,
      });
      if (pessoas.length === 0) return { dia, setores, pessoas: [], observacao: nome ? `Ninguém com "${nome}" no nome na equipe.` : "A equipe não tem ninguém ativo." };
      const ids = pessoas.map((p) => p.id);
      const noDia = { gte: inicio, lt: fim };

      const [atividades, etapas, transferencias, auditoria, itens] = await Promise.all([
        prisma.activity.groupBy({
          by: ["userId", "type"],
          where: { tenantId: ctx.tenantId, userId: { in: ids }, createdAt: noDia, pipelineItem: { pipeline: { sectorCode: { in: setores } } } },
          _count: { _all: true },
        }),
        prisma.processStep.groupBy({
          by: ["executedByUserId"],
          where: { tenantId: ctx.tenantId, executedByUserId: { in: ids }, doneAt: noDia },
          _count: { _all: true },
        }),
        prisma.handoff.groupBy({
          by: ["requestedBy"],
          where: { tenantId: ctx.tenantId, requestedBy: { in: ids }, createdAt: noDia },
          _count: { _all: true },
        }),
        prisma.auditLog.groupBy({
          by: ["userId"],
          where: { tenantId: ctx.tenantId, userId: { in: ids }, createdAt: noDia },
          _count: { _all: true },
        }),
        itensDaGestao(ctx.tenantId, setores),
      ]);

      const conta = (lista: { _count: { _all: number } }[]) => lista.reduce((s, x) => s + x._count._all, 0);
      return {
        dia,
        setores,
        pessoas: pessoas.map((p) => {
          const minhas = atividades.filter((a) => a.userId === p.id);
          const meusItens = itens.filter((x) => x.item.responsaveis.includes(p.id));
          return {
            id: p.id,
            nome: p.name,
            citar: `@[${p.name}](usuario:${p.id})`,
            cardsMovidos: conta(minhas.filter((a) => a.type === "STATUS_CHANGE")),
            comentarios: conta(minhas.filter((a) => a.type === "NOTE")),
            outrasNoKanban: conta(minhas.filter((a) => a.type !== "STATUS_CHANGE" && a.type !== "NOTE")),
            etapasDeProcessoConcluidas: conta(etapas.filter((e) => e.executedByUserId === p.id)),
            transferenciasEnviadas: conta(transferencias.filter((t) => t.requestedBy === p.id)),
            acoesRegistradas: conta(auditoria.filter((a) => a.userId === p.id)),
            itensConcluidosNoDia: meusItens.filter((x) => x.item.concluidoEm && x.item.concluidoEm >= inicio && x.item.concluidoEm < fim).length,
            paradosComEla: meusItens.filter((x) => x.c.coluna !== "CONCLUIDO" && x.c.parado !== null && !x.c.paradoDeProposito).length,
          };
        }),
      };
    },
  },
};
