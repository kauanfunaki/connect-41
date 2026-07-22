// Funil de recrutamento — etapas ordenadas e cálculo de conversão. O `stage` de
// cada Candidatura é preservado mesmo quando ela é reprovada/desistente, então
// dá pra medir "quantos alcançaram cada etapa" sem uma tabela de histórico:
// reachedCount(etapa) = candidaturas cujo stage é >= aquela etapa.

export const STAGE_ORDER = ["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA", "CONTRATADO"] as const;
export type Stage = (typeof STAGE_ORDER)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  TRIAGEM: "Triagem",
  ENTREVISTA: "Entrevista",
  TESTE: "Teste",
  PROPOSTA: "Proposta",
  CONTRATADO: "Contratado",
};

// Etapas ativas do board (a coluna Contratado é o destino final; reprovado/
// desistente saem do funil pra faixa de "Encerrados").
export const ACTIVE_STAGES: Stage[] = ["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA", "CONTRATADO"];

const TERMINAL_NEGATIVE = ["REPROVADO", "DESISTENTE"];

export function stageIndex(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage as Stage);
  return i === -1 ? 0 : i;
}

export type FunnelStageStat = {
  stage: Stage;
  label: string;
  reached: number; // alcançaram esta etapa ou além (inclui reprovados que chegaram aqui)
  current: number; // estão nesta etapa agora e ativos (não reprovados/desistentes)
  conversionPct: number; // reached / total
};

export type FunnelStats = {
  total: number;
  stages: FunnelStageStat[];
  contratados: number;
  reprovados: number;
  desistentes: number;
};

export function computeFunnelConversion(
  candidaturas: { stage: string; status: string }[]
): FunnelStats {
  const total = candidaturas.length;

  const stages: FunnelStageStat[] = STAGE_ORDER.map((stage, i) => {
    const reached = candidaturas.filter((c) => stageIndex(c.stage) >= i).length;
    const current = candidaturas.filter(
      (c) => c.stage === stage && !TERMINAL_NEGATIVE.includes(c.status)
    ).length;
    return {
      stage,
      label: STAGE_LABEL[stage],
      reached,
      current,
      conversionPct: total > 0 ? Math.round((reached / total) * 100) : 0,
    };
  });

  return {
    total,
    stages,
    contratados: candidaturas.filter((c) => c.status === "CONTRATADO").length,
    reprovados: candidaturas.filter((c) => c.status === "REPROVADO").length,
    desistentes: candidaturas.filter((c) => c.status === "DESISTENTE").length,
  };
}
