"use server";

import type { PropostaDeEscrita } from "@/lib/ia/ferramentas";
import { RecruitmentStage } from "@/generated/prisma/enums";
import { moverEtapaCandidatura, encerrarCandidatura } from "./actions";

// O "Assistente da vaga" (a caixa de pergunta no pé do funil, com o agente
// `assistente_de_vaga`) saiu da ficha em 14/10/2026 — escolha "Vaga · 6 C" do
// Kauan: repetia a Ceci do canto, que já recebe a vaga como assunto e sugere
// os mesmos movimentos. A pergunta (`perguntarAoAssistente`) saiu com ele.
// Fica o aplicar: é por ele que a Ceci do Recrutamento aplica uma proposta de
// mover ou encerrar candidatura (`aplicarPropostaDoChat`, em ia/chat-actions).

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
