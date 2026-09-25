// As ferramentas da IA do Recrutamento no chat do canto da tela.
//
// O assistente da vaga (`ferramentas-recrutamento.ts`) trabalha **uma** vaga,
// presa ao recorte da tela. No chat a pergunta é do setor — "quais vagas estão
// paradas?", "onde está a Maria?" — e por isso o recorte aqui é outro: o
// tenant e os **setores em que a pessoa atua** (`escopo.setores`, montado por
// quem abre o chat). A vaga é argumento do modelo, mas toda consulta leva o
// recorte junto: vaga de setor fora do acesso responde "não encontrada", como
// se não existisse.
//
// As leituras de vaga e candidatura são as mesmas do assistente da vaga
// (`lerVaga`, `lerCandidatos`, `lerCandidatura`). As propostas também:
// `propor_mover_etapa` e `propor_encerrar_candidatura` já estão registradas e
// entram na allowlist do agente pelo nome.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { lerCandidatos, lerCandidatura, lerVaga } from "@/lib/ia/ferramentas-recrutamento";
import { setoresDoEscopo } from "@/lib/ia/ferramentas-ajuda";

/** O `where` das vagas que a pessoa pode ver. Sem setor no recorte, nada. */
export function recorteDasVagas(ctx: ContextoDaFerramenta): Prisma.VagaWhereInput {
  const setores = [...setoresDoEscopo(ctx)];
  if (setores.length === 0) throw new Error("Nenhum setor de recrutamento no seu acesso.");
  return { tenantId: ctx.tenantId, sectorCode: { in: setores } };
}

/** O `where` das candidaturas dessas vagas. */
export function recorteDasCandidaturasDoSetor(ctx: ContextoDaFerramenta): Prisma.CandidaturaWhereInput {
  const vaga = recorteDasVagas(ctx);
  return { tenantId: ctx.tenantId, vaga };
}

function idPedido(argumentos: Record<string, unknown>, campo: string): string {
  const v = argumentos[campo];
  if (typeof v !== "string" || !v.trim()) throw new Error(`Informe o ${campo}.`);
  return v.trim();
}

const PEDE_VAGA = {
  type: "object",
  properties: { vagaId: { type: "string", description: "O id que veio de listar_vagas" } },
  required: ["vagaId"],
  additionalProperties: false,
} as const;

const DIA = 24 * 60 * 60 * 1000;

export const FERRAMENTAS_DE_RECRUTAMENTO_DO_SETOR: Record<string, FerramentaRegistrada> = {
  listar_vagas: {
    def: {
      nome: "listar_vagas",
      descricao:
        "As vagas do recrutamento: título, empresa, status, prioridade, há quantos dias está aberta, quantos candidatos em cada etapa, quantos chegaram nos últimos 7 dias e quantos ainda sem nota da triagem. Comece por aqui.",
      parametros: {
        type: "object",
        properties: {
          incluirEncerradas: { type: "boolean", description: "true para incluir vagas encerradas e canceladas; normalmente false." },
        },
        // Obrigatório porque o modo estrito da OpenAI não aceita parâmetro opcional.
        required: ["incluirEncerradas"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const agora = Date.now();
      const where: Prisma.VagaWhereInput = {
        ...recorteDasVagas(ctx),
        ...(args.incluirEncerradas === true ? {} : { status: { in: ["ABERTA", "EM_ANDAMENTO"] } }),
      };
      const vagas = await getPrisma().vaga.findMany({
        where,
        orderBy: { openedAt: "asc" },
        take: 60,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          quantity: true,
          openedAt: true,
          company: { select: { name: true, tradeName: true } },
          candidaturas: {
            where: { status: "EM_ANDAMENTO" },
            select: { stage: true, createdAt: true, _count: { select: { notas: true } } },
          },
        },
      });
      return vagas.map((v) => {
        const porEtapa: Record<string, number> = {};
        for (const c of v.candidaturas) porEtapa[c.stage] = (porEtapa[c.stage] ?? 0) + 1;
        return {
          vagaId: v.id,
          titulo: v.title,
          empresa: v.company.tradeName || v.company.name,
          status: v.status,
          prioridade: v.priority,
          vagas: v.quantity,
          diasAberta: Math.floor((agora - v.openedAt.getTime()) / DIA),
          candidatosEmAndamentoPorEtapa: porEtapa,
          chegaramNosUltimos7Dias: v.candidaturas.filter((c) => agora - c.createdAt.getTime() <= 7 * DIA).length,
          semNotaDaTriagem: v.candidaturas.filter((c) => c._count.notas === 0).length,
        };
      });
    },
  },

  ver_vaga_do_setor: {
    def: {
      nome: "ver_vaga_do_setor",
      descricao: "Dados de uma vaga: cargo, empresa, quantidade, status, prioridade, descrição pública e anotações internas.",
      parametros: PEDE_VAGA as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => lerVaga({ ...recorteDasVagas(ctx), id: idPedido(args, "vagaId") }),
  },

  listar_candidatos_da_vaga: {
    def: {
      nome: "listar_candidatos_da_vaga",
      descricao:
        "Os candidatos de uma vaga, com o id da candidatura, a etapa, a situação, a nota da triagem e os dados de cadastro.",
      parametros: PEDE_VAGA as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => lerCandidatos({ ...recorteDasCandidaturasDoSetor(ctx), vagaId: idPedido(args, "vagaId") }),
  },

  ver_candidatura: {
    def: {
      nome: "ver_candidatura",
      descricao:
        "O detalhe de uma candidatura: vaga, contato, etapa, nota e resumo da triagem, e as fichas de entrevista.",
      parametros: {
        type: "object",
        properties: { candidaturaId: { type: "string", description: "O id que veio de listar_candidatos_da_vaga ou buscar_candidato" } },
        required: ["candidaturaId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const c = await lerCandidatura({ ...recorteDasCandidaturasDoSetor(ctx), id: idPedido(args, "candidaturaId") });
      if (!c) throw new Error("Candidatura não encontrada.");
      return c;
    },
  },

  buscar_candidato: {
    def: {
      nome: "buscar_candidato",
      descricao: "Procura candidatos pelo nome, em todas as vagas. Devolve cada candidatura com a vaga, a etapa e a situação.",
      parametros: {
        type: "object",
        properties: { nome: { type: "string", description: "Nome ou parte do nome, ex.: 'Maria Souza'" } },
        required: ["nome"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const nome = idPedido(args, "nome");
      if (nome.length < 3) throw new Error("Informe ao menos 3 letras do nome.");
      const linhas = await getPrisma().candidatura.findMany({
        where: { ...recorteDasCandidaturasDoSetor(ctx), person: { name: { contains: nome } } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          stage: true,
          status: true,
          createdAt: true,
          person: { select: { name: true } },
          vaga: { select: { id: true, title: true } },
        },
      });
      return linhas.map((c) => ({
        candidaturaId: c.id,
        nome: c.person.name,
        vaga: { vagaId: c.vaga.id, titulo: c.vaga.title },
        etapa: c.stage,
        situacao: c.status,
        inscritoEm: c.createdAt.toISOString().slice(0, 10),
      }));
    },
  },
};
