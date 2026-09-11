"use server";

import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { conversarComAgente } from "@/lib/ai";
import type { PropostaDeEscrita } from "@/lib/ia/ferramentas";
import { RecruitmentStage } from "@/generated/prisma/enums";
import { moverEtapaCandidatura, encerrarCandidatura } from "./actions";

const AGENTE = "assistente_de_vaga";

const SISTEMA =
  "Você ajuda um recrutador de um escritório de contabilidade a trabalhar UMA vaga. " +
  "Consulte as ferramentas antes de responder — nunca invente candidato, nota ou etapa. " +
  "Responda em português do Brasil, direto, sem enrolação, e cite os candidatos pelo nome. " +
  "Quando faltar informação para responder com segurança, diga o que falta em vez de supor. " +
  "Você NÃO altera nada no sistema: quando fizer sentido mover ou encerrar alguém, use as " +
  "ferramentas de proposta e deixe claro que é uma sugestão a confirmar.";

export type RespostaDoAssistente =
  | { error: string }
  | { texto: string; propostas: PropostaDeEscrita[]; truncado: boolean };

/**
 * A permissão é checada aqui, uma vez, e o recorte segue com a conversa.
 *
 * As ferramentas não recebem `vagaId` do modelo: recebem do `escopo`. Então
 * este é o único ponto onde "esta pessoa pode mexer nesta vaga" precisa ser
 * verdade — e depois dele não há como o agente sair do recorte.
 */
export async function perguntarAoAssistente(
  vagaId: string,
  pergunta: string
): Promise<RespostaDoAssistente> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const texto = pergunta.trim();
  if (!texto) return { error: "Escreva a pergunta." };
  if (texto.length > 2_000) return { error: "Pergunta muito longa." };

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({
    where: { id: vagaId, tenantId: ctx.tenantId },
    select: { sectorCode: true },
  });
  if (!vaga) return { error: "Vaga não encontrada." };
  if (!canActOnSector(ctx, vaga.sectorCode)) {
    return { error: "Sem permissão para usar o assistente nesta vaga." };
  }

  try {
    const r = await conversarComAgente({
      tenantId: ctx.tenantId,
      agentCode: AGENTE,
      system: SISTEMA,
      pergunta: texto,
      contexto: { userId: ctx.userId, entityType: "vaga", entityId: vagaId },
      escopo: { vagaId },
    });
    return { texto: r.valor, propostas: r.propostas, truncado: r.truncado };
  } catch (err) {
    console.error("[perguntarAoAssistente]", err);
    // A mensagem do teto ("O teto de gasto de IA deste mês foi atingido") é
    // exatamente o que a pessoa precisa ler — vem de `podeChamar` e chega aqui
    // como Error.
    return { error: err instanceof Error ? err.message : "Erro ao falar com o assistente." };
  }
}

const ETAPAS = Object.values(RecruitmentStage) as string[];

/**
 * Aplica uma proposta — chamando a server action que já existia.
 *
 * **Não há atalho aqui.** `moverEtapaCandidatura` e `encerrarCandidatura`
 * refazem toda a checagem por conta própria: tenant, vaga, setor, e a regra de
 * promoção a colaborador quando a etapa é CONTRATADO. Se esta função gravasse
 * direto, a fronteira da Onda 2 seria só uma tela de confirmação, e não o que
 * ela é — o agente não tendo caminho para o banco.
 *
 * Os argumentos vêm do modelo e são tratados como entrada de formulário: tipo
 * conferido, valor conferido contra o enum, nada aproveitado no escuro.
 */
export async function aplicarProposta(
  vagaId: string,
  proposta: PropostaDeEscrita
): Promise<{ error: string } | null> {
  const args = proposta.argumentos ?? {};
  const candidaturaId = typeof args.candidaturaId === "string" ? args.candidaturaId : "";
  if (!candidaturaId) return { error: "Proposta sem candidato." };

  if (proposta.ferramenta === "propor_mover_etapa") {
    const etapa = typeof args.etapa === "string" ? args.etapa : "";
    if (!ETAPAS.includes(etapa)) return { error: "Etapa inválida na proposta." };
    return moverEtapaCandidatura(vagaId, candidaturaId, etapa as RecruitmentStage);
  }

  if (proposta.ferramenta === "propor_encerrar_candidatura") {
    const desfecho = args.desfecho;
    if (desfecho !== "REPROVADO" && desfecho !== "DESISTENTE") {
      return { error: "Desfecho inválido na proposta." };
    }
    const motivo = typeof args.motivo === "string" ? args.motivo.trim() || null : null;
    return encerrarCandidatura(vagaId, candidaturaId, desfecho, motivo);
  }

  return { error: "Proposta desconhecida." };
}
