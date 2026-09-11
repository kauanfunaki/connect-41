"use server";

import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { conversarComAgente } from "@/lib/ai";
import type { PropostaDeEscrita } from "@/lib/ia/ferramentas";
import { concluirEtapa, dispensarEtapa } from "./actions";

const AGENTE = "assistente_do_societario";
const SETOR = "societario";

const SISTEMA =
  "Você ajuda o coordenador do Societário a enxergar a fila de processos de abertura, " +
  "alteração e baixa de empresas. Consulte as ferramentas antes de responder — nunca invente " +
  "processo, etapa, prazo ou protocolo.\n" +
  "Responda em português do Brasil, direto, citando empresa e tipo de processo. Quando listar " +
  "vários, priorize o que está parado há mais tempo e o que está em exigência.\n" +
  "Você NÃO altera nada: quando vir uma etapa pronta para fechar ou que claramente não se " +
  "aplica, use as ferramentas de proposta e deixe claro que é sugestão a confirmar. Não sugira " +
  "concluir etapa que tenha item obrigatório pendente, nem etapa de órgão — essa se encerra " +
  "pelo protocolo.";

export type RespostaDoSocietario =
  | { error: string }
  | { texto: string; propostas: PropostaDeEscrita[]; truncado: boolean };

export async function perguntarAoSocietario(pergunta: string): Promise<RespostaDoSocietario> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, SETOR)) return { error: "Sem permissão no Societário." };

  const texto = pergunta.trim();
  if (!texto) return { error: "Escreva a pergunta." };
  if (texto.length > 2_000) return { error: "Pergunta muito longa." };

  try {
    const r = await conversarComAgente({
      tenantId: ctx.tenantId,
      agentCode: AGENTE,
      system: SISTEMA,
      pergunta: texto,
      contexto: { userId: ctx.userId, entityType: "societario", entityId: null },
      // O recorte deste agente é o setor inteiro, e não um processo: a pergunta
      // do coordenador é sobre a fila. Quem já pode ver a fila pode perguntar
      // sobre ela — a checagem acima é a mesma da tela.
      escopo: {},
    });
    return { texto: r.valor, propostas: r.propostas, truncado: r.truncado };
  } catch (err) {
    console.error("[perguntarAoSocietario]", err);
    return { error: err instanceof Error ? err.message : "Erro ao falar com o assistente." };
  }
}

/**
 * Aplica uma proposta chamando a server action que já existia.
 *
 * `concluirEtapa` e `dispensarEtapa` refazem tudo por conta própria — tenant,
 * setor, e a regra de que etapa de órgão não fecha à mão. Se esta função
 * gravasse direto, a fronteira seria só um diálogo de confirmação.
 */
export async function aplicarPropostaDoSocietario(
  proposta: PropostaDeEscrita
): Promise<{ error: string } | null> {
  const args = proposta.argumentos ?? {};
  const stepId = typeof args.stepId === "string" ? args.stepId.trim() : "";
  if (!stepId) return { error: "Proposta sem etapa." };

  if (proposta.ferramenta === "propor_concluir_etapa") return concluirEtapa(stepId);
  if (proposta.ferramenta === "propor_dispensar_etapa") return dispensarEtapa(stepId);
  return { error: "Proposta desconhecida." };
}
