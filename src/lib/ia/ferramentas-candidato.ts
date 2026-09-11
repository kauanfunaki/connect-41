// As ferramentas do atendente de candidato, no WhatsApp.
//
// ─── O que este agente NÃO pode consultar ───────────────────────────────────
//
// Quem está do outro lado é o candidato, não o recrutador. Então nada de
// anotação interna da vaga, nota de entrevista, recomendação de avaliador ou
// contato de outra pessoa: é informação que existe no banco e que **não é dele
// para ver**. O assistente da vaga lê tudo isso; este lê o que o próprio
// candidato já poderia perguntar por telefone.
//
// A regra fica aqui, no `select` de cada consulta, e não no prompt — prompt se
// contorna com uma frase bem escrita, `select` não.
//
// ─── E não coleta identidade ────────────────────────────────────────────────
//
// Se a conversa não estiver ligada a uma candidatura, o robô não pergunta CPF,
// e-mail nem data de nascimento para descobrir quem é. Coletar documento por
// WhatsApp, num canal que a pessoa não escolheu, é o tipo de coisa que só
// parece prática até acontecer com o número errado. Sem vínculo, ele diz o que
// sabe e passa para uma pessoa.

import { getPrisma } from "@/lib/prisma";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";

/** O id da conversa, do recorte. Nunca vem do modelo. */
export function threadDoEscopo(ctx: ContextoDaFerramenta): string {
  const threadId = ctx.escopo.threadId;
  if (!threadId) throw new Error("Esta ferramenta só funciona dentro de uma conversa de WhatsApp.");
  return threadId;
}

const SEM_PARAMETROS = { type: "object", properties: {}, additionalProperties: false } as const;

const ETAPA_EM_PORTUGUES: Record<string, string> = {
  TRIAGEM: "em triagem",
  ENTREVISTA: "na etapa de entrevista",
  TESTE: "na etapa de teste",
  PROPOSTA: "na etapa de proposta",
  CONTRATADO: "contratado",
};

const SITUACAO_EM_PORTUGUES: Record<string, string> = {
  EM_ANDAMENTO: "em andamento",
  APROVADO: "aprovado",
  REPROVADO: "encerrado",
  DESISTENTE: "encerrado por desistência",
  CONTRATADO: "contratado",
  ENCERRADO: "encerrado",
};

export const FERRAMENTAS_DE_CANDIDATO: Record<string, FerramentaRegistrada> = {
  ver_meu_processo: {
    def: {
      nome: "ver_meu_processo",
      descricao:
        "A situação do processo seletivo da pessoa com quem você está falando: a vaga, a etapa e a situação. Use antes de responder qualquer pergunta sobre 'meu processo'.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      const threadId = threadDoEscopo(ctx);
      const prisma = getPrisma();

      const thread = await prisma.whatsappThread.findFirst({
        where: { id: threadId, tenantId: ctx.tenantId },
        select: { candidaturaId: true },
      });
      if (!thread?.candidaturaId) {
        // Não é erro: é o caso normal de quem escreve pela primeira vez.
        return {
          identificado: false,
          recado:
            "Esta conversa ainda não está ligada a nenhuma candidatura. Não peça documento nem dado pessoal — diga que vai passar para uma pessoa do time confirmar.",
        };
      }

      const c = await prisma.candidatura.findFirst({
        where: { id: thread.candidaturaId, tenantId: ctx.tenantId },
        select: {
          stage: true,
          status: true,
          createdAt: true,
          // Sem `notes`, sem `rejectionReason`, sem scorecards: ver o cabeçalho.
          vaga: { select: { title: true, company: { select: { tradeName: true, name: true } } } },
        },
      });
      if (!c) throw new Error("Candidatura não encontrada.");

      return {
        identificado: true,
        vaga: c.vaga.title,
        empresa: c.vaga.company.tradeName || c.vaga.company.name,
        etapa: ETAPA_EM_PORTUGUES[c.stage] ?? c.stage,
        situacao: SITUACAO_EM_PORTUGUES[c.status] ?? c.status,
        inscritoEm: c.createdAt.toISOString().slice(0, 10),
      };
    },
  },

  listar_vagas_abertas: {
    def: {
      nome: "listar_vagas_abertas",
      descricao:
        "As vagas abertas e divulgadas publicamente, com a descrição pública. Use quando a pessoa perguntar se há outras oportunidades.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      // Só o que já é público no portal de carreiras. `isPublic` é a mesma
      // chave que decide o que aparece em `/carreiras` — se não está lá, não
      // sai por aqui.
      const prisma = getPrisma();
      const vagas = await prisma.vaga.findMany({
        where: { tenantId: ctx.tenantId, status: "ABERTA", isPublic: true },
        orderBy: { openedAt: "desc" },
        take: 20,
        select: {
          title: true,
          publicDescription: true,
          company: { select: { tradeName: true, name: true } },
        },
      });
      return vagas.map((v) => ({
        vaga: v.title,
        empresa: v.company.tradeName || v.company.name,
        descricao: v.publicDescription,
      }));
    },
  },

  pedir_ajuda_humana: {
    def: {
      nome: "pedir_ajuda_humana",
      descricao:
        "Use SEMPRE que a pergunta sair do que você pode responder — reprovação, salário, proposta, contratação, reclamação, ou qualquer coisa que você não consiga confirmar no sistema. Ao usar, sua resposta não é enviada: uma pessoa do time assume a conversa.",
      parametros: {
        type: "object",
        properties: { motivo: { type: "string", description: "Por que precisa de uma pessoa" } },
        required: ["motivo"],
        additionalProperties: false,
      },
      // Declarada como escrita, e sem executor, porque é assim que ela vira
      // proposta — e qualquer proposta nesta conversa significa transferir.
      // Ver `decidirComARespostaDoAgente`, em `src/lib/whatsapp/decisao.ts`.
      natureza: "escrita",
    },
  },
};
