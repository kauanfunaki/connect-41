// O que o candidato vê do próprio processo, na conta dele do portal de vagas.
//
// Decisões do Kauan em 23/09:
// - aparece a etapa atual, numa linha do tempo (Triagem → Entrevista → Teste →
//   Proposta). A nota da triagem **nunca** aparece;
// - reprovado vê um texto neutro, "Processo encerrado para esta vaga", sem
//   motivo e sem a linha do tempo — mostrar em que etapa parou é dar o motivo
//   por outro caminho;
// - entrevistas marcadas e testes pendentes aparecem (ver a página).

import type { ProcessoSeletivoStatus, RecruitmentStage } from "@/generated/prisma/enums";

export const ETAPAS_VISIVEIS: { etapa: RecruitmentStage; rotulo: string }[] = [
  { etapa: "TRIAGEM", rotulo: "Triagem" },
  { etapa: "ENTREVISTA", rotulo: "Entrevista" },
  { etapa: "TESTE", rotulo: "Teste" },
  { etapa: "PROPOSTA", rotulo: "Proposta" },
];

export type Tom = "andamento" | "encerrada" | "desistiu" | "aprovada";

export type SituacaoParaCandidato = {
  titulo: string;
  tom: Tom;
  /** Nula quando mostrar a etapa diria mais do que o texto neutro diz. */
  linhaDoTempo: { rotulo: string; estado: "feita" | "atual" | "futura" }[] | null;
  podeDesistir: boolean;
};

export function situacaoParaCandidato(c: { status: ProcessoSeletivoStatus; stage: RecruitmentStage }): SituacaoParaCandidato {
  if (c.status === "CONTRATADO" || c.stage === "CONTRATADO") {
    return { titulo: "Contratado", tom: "aprovada", linhaDoTempo: null, podeDesistir: false };
  }
  if (c.status === "APROVADO") {
    return { titulo: "Aprovado — a equipe vai entrar em contato", tom: "aprovada", linhaDoTempo: null, podeDesistir: false };
  }
  if (c.status === "DESISTENTE") {
    return { titulo: "Você desistiu desta vaga", tom: "desistiu", linhaDoTempo: null, podeDesistir: false };
  }
  if (c.status === "REPROVADO" || c.status === "ENCERRADO") {
    return { titulo: "Processo encerrado para esta vaga", tom: "encerrada", linhaDoTempo: null, podeDesistir: false };
  }
  const atual = Math.max(0, ETAPAS_VISIVEIS.findIndex((e) => e.etapa === c.stage));
  return {
    titulo: `Em andamento — ${ETAPAS_VISIVEIS[atual]!.rotulo.toLowerCase()}`,
    tom: "andamento",
    linhaDoTempo: ETAPAS_VISIVEIS.map((e, i) => ({
      rotulo: e.rotulo,
      estado: i < atual ? ("feita" as const) : i === atual ? ("atual" as const) : ("futura" as const),
    })),
    podeDesistir: true,
  };
}

/** E-mail como identidade: sem espaço, minúsculo. */
export function normalizarEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function emailValido(email: string): boolean {
  return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
