"use server";

import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { conversarComAgente } from "@/lib/ai";
import type { PropostaDeEscrita } from "@/lib/ia/ferramentas";
import { concluirEtapa, dispensarEtapa } from "./actions";
import { setorDoModulo } from "@/lib/modules";
import { SISTEMA_DO_SOCIETARIO as SISTEMA } from "@/lib/societario/assistente";

const AGENTE = "assistente_do_societario";
// `SETOR` é o de origem, usado só como padrão: o acesso segue o setor que opera
// a fila de processos neste tenant — ver `setorDoModulo`.
const SETOR = "societario";
const MODULE = "societario_processos";

export type RespostaDoSocietario =
  | { error: string }
  | { texto: string; propostas: PropostaDeEscrita[]; truncado: boolean };

export async function perguntarAoSocietario(pergunta: string): Promise<RespostaDoSocietario> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SETOR)) return { error: "Sem permissão no Societário." };

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
    // Encaminhar para outro setor é coisa do chat do canto da tela; aqui, no
    // cartão da fila, só valem as propostas que este cartão sabe aplicar.
    const propostas = r.propostas.filter((p) => p.ferramenta !== "encaminhar_pergunta");
    return { texto: r.valor, propostas, truncado: r.truncado };
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
