// As ferramentas do assistente de vaga — as primeiras do Connect.
//
// ─── O recorte é da conversa, não do modelo ─────────────────────────────────
//
// Toda leitura aqui é presa a `escopo.vagaId`, que vem de quem abriu a
// conversa — a tela da vaga, depois de checar tenant e setor. O modelo não
// recebe `vagaId` como parâmetro em lugar nenhum, e `ver_candidato` confirma
// que a candidatura pedida pertence àquela vaga antes de devolver qualquer
// coisa.
//
// Sem essa confirmação, o modelo poderia passar um id de candidatura de outra
// vaga — inventado, ou sugerido pelo texto de um currículo — e ler o candidato
// de um processo que o recrutador não abriu. É o mesmo buraco do `tenantId`,
// um nível abaixo.
//
// ─── Nada aqui grava ────────────────────────────────────────────────────────
//
// As duas ferramentas de escrita não têm executor: viram proposta, e quem
// confirma na tela dispara `moverEtapaCandidatura` / `encerrarCandidatura` —
// as mesmas server actions de sempre, com `canActOnSector` e `revalidatePath`.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";

/** Lê o id da vaga do recorte, ou falha alto. */
function vagaDoEscopo(ctx: ContextoDaFerramenta): string {
  const vagaId = ctx.escopo.vagaId;
  if (!vagaId) throw new Error("Esta ferramenta só funciona numa conversa aberta a partir de uma vaga.");
  return vagaId;
}

/** O `where` de uma consulta à vaga do recorte. */
export function recorteDaVaga(ctx: ContextoDaFerramenta): { id: string; tenantId: string } {
  return { id: vagaDoEscopo(ctx), tenantId: ctx.tenantId };
}

/** O `where` de uma consulta às candidaturas da vaga do recorte. */
export function recorteDasCandidaturas(ctx: ContextoDaFerramenta): {
  vagaId: string;
  tenantId: string;
} {
  return { vagaId: vagaDoEscopo(ctx), tenantId: ctx.tenantId };
}

/**
 * O `where` de **uma** candidatura, pelo id que o modelo pediu.
 *
 * Função exportada, e não trecho inline, porque é a linha mais sensível do
 * arquivo: as três chaves precisam estar lá. Sem `vagaId`, um id de candidatura
 * de outra vaga do mesmo cliente — inventado pelo modelo, ou sugerido pelo
 * texto de um currículo — devolveria o candidato de um processo que o
 * recrutador não abriu. Inline, essa chave some numa refatoração e nenhum teste
 * nota; aqui, some e um teste cai.
 */
export function recorteDaCandidatura(
  argumentos: Record<string, unknown>,
  ctx: ContextoDaFerramenta
): { id: string; vagaId: string; tenantId: string } {
  const id = argumentos.candidaturaId;
  if (typeof id !== "string" || !id.trim()) throw new Error("Informe o candidaturaId.");
  return { id: id.trim(), ...recorteDasCandidaturas(ctx) };
}

const SEM_PARAMETROS = { type: "object", properties: {}, additionalProperties: false } as const;

// ─── As leituras, compartilhadas com a IA do Recrutamento no chat ────────────
//
// O `where` vem de quem chama: aqui, o recorte da vaga da conversa; no chat
// (`ferramentas-recrutamento-setor.ts`), o tenant e os setores da pessoa. A
// leitura é a mesma para as duas IAs não verem a mesma candidatura de dois
// jeitos.

export async function lerVaga(where: Prisma.VagaWhereInput) {
  const vaga = await getPrisma().vaga.findFirst({
    where,
    select: {
      title: true,
      quantity: true,
      status: true,
      priority: true,
      openedAt: true,
      publicDescription: true,
      notes: true,
      company: { select: { name: true, tradeName: true } },
      cargo: { select: { name: true } },
    },
  });
  if (!vaga) throw new Error("Vaga não encontrada.");
  return {
    titulo: vaga.title,
    cargo: vaga.cargo?.name ?? null,
    empresa: vaga.company.tradeName || vaga.company.name,
    vagas: vaga.quantity,
    status: vaga.status,
    prioridade: vaga.priority,
    abertaEm: vaga.openedAt.toISOString().slice(0, 10),
    descricaoPublica: vaga.publicDescription,
    anotacoesInternas: vaga.notes,
  };
}

export async function lerCandidatos(where: Prisma.CandidaturaWhereInput) {
  const candidaturas = await getPrisma().candidatura.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      vagaId: true,
      stage: true,
      status: true,
      origin: true,
      resumeUrl: true,
      createdAt: true,
      person: { select: { name: true, city: true, stateCode: true, education: true } },
      _count: { select: { scorecards: true } },
      notas: { select: { score: true, faixa: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return candidaturas.map((c) => ({
    candidaturaId: c.id,
    vagaId: c.vagaId,
    nome: c.person.name,
    etapa: c.stage,
    situacao: c.status,
    cidade: c.person.city,
    uf: c.person.stateCode,
    escolaridade: c.person.education,
    origem: c.origin,
    temCurriculo: c.resumeUrl !== null,
    entrevistas: c._count.scorecards,
    notaDaTriagem: c.notas[0] ? { nota: c.notas[0].score, faixa: c.notas[0].faixa } : null,
    inscritoEm: c.createdAt.toISOString().slice(0, 10),
  }));
}

/** Uma candidatura, ou `null` fora do recorte. */
export async function lerCandidatura(where: Prisma.CandidaturaWhereInput) {
  const c = await getPrisma().candidatura.findFirst({
    where,
    select: {
      stage: true,
      status: true,
      origin: true,
      rejectionReason: true,
      withdrawalReason: true,
      createdAt: true,
      vaga: { select: { id: true, title: true } },
      notas: { select: { score: true, faixa: true, resumo: true }, orderBy: { createdAt: "desc" }, take: 1 },
      person: {
        select: { name: true, email: true, phone: true, city: true, stateCode: true, education: true },
      },
      scorecards: {
        select: {
          stage: true,
          comunicacao: true,
          tecnico: true,
          fitCultural: true,
          experiencia: true,
          recommendation: true,
          notes: true,
          evaluator: { select: { name: true } },
        },
      },
    },
  });
  if (!c) return null;
  return {
    vaga: { vagaId: c.vaga.id, titulo: c.vaga.title },
    nome: c.person.name,
    contato: { email: c.person.email, telefone: c.person.phone },
    cidade: c.person.city,
    uf: c.person.stateCode,
    escolaridade: c.person.education,
    etapa: c.stage,
    situacao: c.status,
    origem: c.origin,
    motivoDeReprovacao: c.rejectionReason,
    motivoDeDesistencia: c.withdrawalReason,
    inscritoEm: c.createdAt.toISOString().slice(0, 10),
    notaDaTriagem: c.notas[0] ? { nota: c.notas[0].score, faixa: c.notas[0].faixa, resumo: c.notas[0].resumo } : null,
    entrevistas: c.scorecards.map((s) => ({
      avaliador: s.evaluator.name,
      etapa: s.stage,
      comunicacao: s.comunicacao,
      tecnico: s.tecnico,
      fitCultural: s.fitCultural,
      experiencia: s.experiencia,
      recomendacao: s.recommendation,
      observacoes: s.notes,
    })),
  };
}

const PEDE_CANDIDATURA = {
  type: "object",
  properties: {
    candidaturaId: { type: "string", description: "O id que veio de listar_candidatos" },
  },
  required: ["candidaturaId"],
  additionalProperties: false,
} as const;

export const FERRAMENTAS_DE_RECRUTAMENTO: Record<string, FerramentaRegistrada> = {
  ver_vaga: {
    def: {
      nome: "ver_vaga",
      descricao:
        "Dados da vaga desta conversa: título, cargo, empresa, quantidade, status, prioridade, descrição pública e anotações internas do recrutador.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => lerVaga(recorteDaVaga(ctx)),
  },

  listar_candidatos: {
    def: {
      nome: "listar_candidatos",
      descricao:
        "Todos os candidatos desta vaga, com o id da candidatura, a etapa do funil, a situação e os dados de cadastro. Use o id devolvido aqui para chamar as outras ferramentas.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => lerCandidatos(recorteDasCandidaturas(ctx)),
  },

  ver_candidato: {
    def: {
      nome: "ver_candidato",
      descricao:
        "Detalhe de um candidato desta vaga, com as fichas de entrevista já preenchidas (notas de 1 a 5 e a recomendação de cada avaliador).",
      parametros: PEDE_CANDIDATURA as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      // Antes do banco: recorte ausente ou id malformado param aqui, sem
      // consulta nenhuma ter saído.
      const c = await lerCandidatura(recorteDaCandidatura(args, ctx));
      if (!c) throw new Error("Candidatura não encontrada nesta vaga.");
      return c;
    },
  },

  // ─── As duas de escrita. Sem executor, por construção. ─────────────────────

  propor_mover_etapa: {
    def: {
      nome: "propor_mover_etapa",
      descricao:
        "Propõe mover um candidato para outra etapa do funil. NÃO move: registra a sugestão para o recrutador confirmar.",
      parametros: {
        type: "object",
        properties: {
          candidaturaId: { type: "string" },
          etapa: {
            type: "string",
            enum: ["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA", "CONTRATADO"],
          },
          motivo: { type: "string", description: "Por que, em uma frase, com base no que você leu" },
        },
        required: ["candidaturaId", "etapa", "motivo"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },

  propor_encerrar_candidatura: {
    def: {
      nome: "propor_encerrar_candidatura",
      descricao:
        "Propõe encerrar uma candidatura como reprovada ou desistente. NÃO encerra: registra a sugestão para o recrutador confirmar.",
      parametros: {
        type: "object",
        properties: {
          candidaturaId: { type: "string" },
          desfecho: { type: "string", enum: ["REPROVADO", "DESISTENTE"] },
          motivo: { type: "string", description: "O motivo que ficará registrado na ficha" },
        },
        required: ["candidaturaId", "desfecho", "motivo"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },
};
