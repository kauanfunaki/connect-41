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
import {
  aplicarRespostas,
  faltaPerguntar,
  lerFonte,
  ROTULO_DA_RESPOSTA,
  validarRespostas,
  type Respostas,
} from "@/lib/recrutamento/respostas";

/** A candidatura ligada à conversa — a única em que o registro pode gravar. */
async function candidaturaDaConversa(ctx: ContextoDaFerramenta): Promise<string | null> {
  const thread = await getPrisma().whatsappThread.findFirst({
    where: { id: threadDoEscopo(ctx), tenantId: ctx.tenantId },
    select: { candidaturaId: true },
  });
  return thread?.candidaturaId ?? null;
}

const respostasDe = (c: { pretensaoSalarial: { toNumber(): number } | null; disponibilidade: string | null; deslocamentoMinutos: number | null }): Respostas => ({
  pretensaoSalarial: c.pretensaoSalarial === null ? null : c.pretensaoSalarial.toNumber(),
  disponibilidade: c.disponibilidade,
  deslocamentoMinutos: c.deslocamentoMinutos,
});

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
        "As candidaturas da pessoa com quem você está falando: para cada uma, a vaga, a empresa, a etapa e a situação, da mais recente para a mais antiga. Use antes de responder qualquer pergunta sobre 'meu processo'.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      const threadId = threadDoEscopo(ctx);
      const prisma = getPrisma();

      const thread = await prisma.whatsappThread.findFirst({
        where: { id: threadId, tenantId: ctx.tenantId },
        select: { personId: true, candidaturaId: true },
      });

      // A pessoa, e não uma candidatura só: quem se inscreveu em duas vagas
      // pergunta das duas. Vínculo manual antigo só gravou a candidatura, e é
      // dela que a pessoa sai.
      let personId = thread?.personId ?? null;
      if (!personId && thread?.candidaturaId) {
        const c = await prisma.candidatura.findFirst({
          where: { id: thread.candidaturaId, tenantId: ctx.tenantId },
          select: { personId: true },
        });
        personId = c?.personId ?? null;
      }

      if (!personId) {
        // Não é erro: é o caso normal de quem escreve pela primeira vez.
        return {
          identificado: false,
          recado:
            // Até 15/09 o recado mandava "dizer que vai passar para uma pessoa" —
            // e o modelo dizia, sem chamar a ferramenta que de fato transfere. O
            // candidato ficava com uma promessa de contato que ninguém ia cumprir.
            "Esta conversa ainda não está ligada a nenhuma candidatura. Não peça documento nem dado pessoal. " +
            "Diga que não encontrou uma candidatura ligada a este número e ofereça mostrar as vagas abertas. " +
            "Se a pessoa quiser falar de uma candidatura que já fez, use pedir_ajuda_humana — nunca diga que " +
            "alguém vai entrar em contato sem usar essa ferramenta.",
        };
      }

      const candidaturas = await prisma.candidatura.findMany({
        where: { personId, tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          stage: true,
          status: true,
          createdAt: true,
          // Sem `notes`, sem `rejectionReason`, sem scorecards: ver o cabeçalho.
          vaga: { select: { title: true, company: { select: { tradeName: true, name: true } } } },
        },
      });

      // O que ainda falta perguntar, na candidatura ligada à conversa. Sem
      // os valores já dados: o bot não precisa repetir a pretensão de ninguém.
      const ligada = thread?.candidaturaId
        ? await prisma.candidatura.findFirst({
            where: { id: thread.candidaturaId, tenantId: ctx.tenantId },
            select: { pretensaoSalarial: true, disponibilidade: true, deslocamentoMinutos: true },
          })
        : null;
      const falta = ligada ? faltaPerguntar(respostasDe(ligada)).map((c) => ROTULO_DA_RESPOSTA[c]) : [];

      return {
        identificado: true,
        ...(ligada ? { faltaPerguntar: falta } : {}),
        candidaturas: candidaturas.map((c) => ({
          vaga: c.vaga.title,
          empresa: c.vaga.company.tradeName || c.vaga.company.name,
          etapa: ETAPA_EM_PORTUGUES[c.stage] ?? c.stage,
          situacao: SITUACAO_EM_PORTUGUES[c.status] ?? c.status,
          inscritoEm: c.createdAt.toISOString().slice(0, 10),
        })),
        ...(candidaturas.length === 0 ? { recado: "Esta pessoa não tem candidatura registrada." } : {}),
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

  registrar_respostas_do_candidato: {
    def: {
      nome: "registrar_respostas_do_candidato",
      descricao:
        "Grava na candidatura desta conversa o que o candidato respondeu: pretensão salarial mensal (em reais), disponibilidade para começar (texto curto, ex.: 'imediata', 'em 15 dias') e tempo até o local de trabalho (em minutos). Mande só o que a pessoa disse nesta conversa; o que não sabe vai como null. Nunca registre endereço, bairro ou cidade.",
      parametros: {
        type: "object",
        properties: {
          pretensaoSalarial: { type: ["number", "null"], description: "Reais por mês, só o número" },
          disponibilidade: { type: ["string", "null"], description: "Quando pode começar, até 120 caracteres" },
          deslocamentoMinutos: { type: ["integer", "null"], description: "Minutos até o local de trabalho" },
        },
        required: ["pretensaoSalarial", "disponibilidade", "deslocamentoMinutos"],
        additionalProperties: false,
      },
      // Grava sozinha: está em REGISTROS_AUTOMATICOS (src/lib/ia/ferramentas.ts).
      natureza: "registro",
    },
    executar: async (args, ctx) => {
      const candidaturaId = await candidaturaDaConversa(ctx);
      if (!candidaturaId) {
        return { gravado: false, recado: "Esta conversa não está ligada a uma candidatura: não registre nada nem peça dados para descobrir quem é." };
      }
      const { valores, descartados } = validarRespostas(args);
      const prisma = getPrisma();
      const atual = await prisma.candidatura.findFirst({
        where: { id: candidaturaId, tenantId: ctx.tenantId },
        select: { respostasFonte: true },
      });
      if (!atual) return { gravado: false, recado: "Candidatura não encontrada." };

      const r = aplicarRespostas(lerFonte(atual.respostasFonte), valores, "WHATSAPP", new Date());
      if (r.gravados.length > 0) {
        await prisma.candidatura.update({
          where: { id: candidaturaId },
          data: { ...r.dados, respostasFonte: r.fonte },
        });
      }
      return {
        gravado: r.gravados.length > 0,
        registrado: r.gravados.map((c) => ROTULO_DA_RESPOSTA[c]),
        // O recrutador já definiu esses — não pergunte de novo.
        ...(r.preservados.length ? { jaDefinidoPeloRecrutador: r.preservados.map((c) => ROTULO_DA_RESPOSTA[c]) } : {}),
        ...(descartados.length ? { naoEntendido: descartados.map((c) => ROTULO_DA_RESPOSTA[c]), recado: "Valor fora do esperado: confirme com a pessoa." } : {}),
      };
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
