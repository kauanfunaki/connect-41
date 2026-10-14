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

// ─── Os números no topo de cada coluna do quadro (14/10/2026) ──────────────
//
// Escolha "Vaga · 4 A" do Kauan: o gráfico de funil separado saiu da ficha da
// vaga, e cada coluna do quadro mostra os números da sua etapa. A conta é a
// mesma do gráfico que saiu (o `Funil` de Graficos.tsx): a barra é a parte do
// total que chegou à etapa, e o percentual é a passagem da etapa anterior.

export type NumerosDaColuna = {
  stage: Stage;
  label: string;
  /** Quem está na coluna agora (ativos). */
  agora: number;
  /** Quem chegou a esta etapa ou além — reprovados e desistentes inclusive. */
  chegaram: number;
  /** `chegaram` sobre o total de candidaturas, de 0 a 1: a largura da barrinha. */
  parteDoTotal: number;
  /** Passagem da etapa anterior, de 0 a 1; null na primeira e quando ninguém chegou à anterior. */
  passaram: number | null;
};

export function numerosDasColunas(candidaturas: { stage: string; status: string }[]): NumerosDaColuna[] {
  const { total, stages } = computeFunnelConversion(candidaturas);
  return stages.map((s, i) => {
    const anterior = i > 0 ? stages[i - 1]!.reached : null;
    return {
      stage: s.stage,
      label: s.label,
      agora: s.current,
      chegaram: s.reached,
      parteDoTotal: total > 0 ? s.reached / total : 0,
      passaram: anterior ? s.reached / anterior : null,
    };
  });
}

const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

/** "5 chegaram · 40% passaram", "1 chegou · 100% passaram", "5 chegaram". */
export function linhaDaColuna(n: Pick<NumerosDaColuna, "chegaram" | "passaram">): string {
  const chegaram = n.chegaram === 1 ? "1 chegou" : `${n.chegaram} chegaram`;
  return n.passaram === null ? chegaram : `${chegaram} · ${PCT.format(n.passaram)} passaram`;
}

/** A linha em cima do quadro: "5 candidaturas · 1 contratada de 2 vagas". */
export function resumoDoFunil(candidaturas: number, contratadas: number, vagas: number): string {
  const c = candidaturas === 1 ? "1 candidatura" : `${candidaturas} candidaturas`;
  const k = contratadas === 1 ? "1 contratada" : `${contratadas} contratadas`;
  return `${c} · ${k} de ${vagas === 1 ? "1 vaga" : `${vagas} vagas`}`;
}
