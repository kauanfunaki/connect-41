// Constantes legais do cálculo de rescisão. NÃO são configuráveis por decisão
// explícita: deixar alguém digitar "1/4 constitucional" produziria um número
// errado com a chancela do sistema. O que varia por empresa vive em config.ts.
//
// Cada constante carrega o fundamento legal — é o que a tela mostra ao lado do
// número pra a conferência ser auditável.

/** Versão do motor, gravada no snapshot de cada item conferido (auditoria). */
export const MOTOR_VERSAO = "1.0.0";

export const FUNDAMENTO = {
  DIVISOR_MES: "CLT art. 64",
  TERCO: "CF art. 7º XVII",
  AVISO_BASE: "CLT art. 487 II",
  AVISO_PROPORCIONAL: "Lei 12.506/2011 art. 1º, parágrafo único",
  DECIMO_TERCEIRO: "Lei 4.090/62 art. 1º §2º",
  DECIMO_TERCEIRO_JUSTA_CAUSA: "Lei 4.090/62 art. 3º",
  FERIAS_PROPORCIONAIS: "CLT art. 146, parágrafo único",
  FERIAS_VENCIDAS: "CLT art. 146, caput",
  FERIAS_JUSTA_CAUSA: "Súmula 171 TST",
  FERIAS_PEDIDO_DEMISSAO: "Súmula 261 TST",
  FALTAS: "CLT art. 130",
  FGTS_DEPOSITO: "Lei 8.036/90 art. 15",
  FGTS_MULTA: "Lei 8.036/90 art. 18 §1º",
  ACORDO: "CLT art. 484-A",
  PROJECAO_AVISO: "CLT art. 487 §1º; OJ 82 SDI-1 TST",
  AVISO_DESCONTO: "CLT art. 487 §2º",
  INSALUBRIDADE: "CLT art. 192",
  PERICULOSIDADE: "CLT art. 193 §1º",
  PRAZO_PAGAMENTO: "CLT art. 477 §6º",
} as const;

/** Mês comercial — divisor do saldo de salário e das verbas diárias. */
export const DIVISOR_MES = 30;

/** 1/3 sobre férias (vencidas + proporcionais + abono). */
export const TERCO_CONSTITUCIONAL = 1 / 3;

/** Aviso prévio: 30 dias base + 3 por ano completo, teto de 90. */
export const AVISO_DIAS_BASE = 30;
export const AVISO_DIAS_POR_ANO = 3;
export const AVISO_DIAS_MAX = 90;

/** Um avo conta quando o mês tem 15 dias ou mais trabalhados. */
export const DIAS_MINIMOS_PARA_AVO = 15;

export const FGTS_ALIQUOTA = 0.08;
/** Aprendiz recolhe 2% (Lei 8.036/90 art. 15 §7º). */
export const FGTS_ALIQUOTA_APRENDIZ = 0.02;

/**
 * Multa rescisória sobre o saldo do FGTS, por motivo canônico.
 * A contribuição social de 10% foi EXTINTA pela Lei 13.932/2019 — não incluir.
 */
export const FGTS_MULTA_PCT = {
  DISPENSA_SEM_JUSTA_CAUSA: 0.4,
  RESCISAO_INDIRETA: 0.4,
  ACORDO_MUTUO: 0.2,
  PEDIDO_DEMISSAO: 0,
  DISPENSA_JUSTA_CAUSA: 0,
  TERMINO_PRAZO_DETERMINADO: 0,
  TERMINO_EXPERIENCIA: 0,
} as const;

/** Percentual de insalubridade por grau (CLT art. 192). */
export const INSALUBRIDADE_PCT = {
  NENHUM: 0,
  MINIMO: 0.1,
  MEDIO: 0.2,
  MAXIMO: 0.4,
} as const;

/** Periculosidade é 30% fixo — só a incidência varia por empresa. */
export const PERICULOSIDADE_PCT = 0.3;

/**
 * Tabela de dias de férias por faltas injustificadas no período aquisitivo
 * (CLT art. 130). Ordenada por limite crescente de faltas.
 */
export const FALTAS_TABELA: { ateFaltas: number; dias: number }[] = [
  { ateFaltas: 5, dias: 30 },
  { ateFaltas: 14, dias: 24 },
  { ateFaltas: 23, dias: 18 },
  { ateFaltas: 32, dias: 12 },
  { ateFaltas: Infinity, dias: 0 },
];

export function diasDeFeriasPorFaltas(faltas: number): number {
  const faixa = FALTAS_TABELA.find((f) => faltas <= f.ateFaltas);
  return faixa?.dias ?? 0;
}

/**
 * Salário mínimo por ano — entra como base padrão da insalubridade.
 *
 * ⚠️ MANUTENÇÃO ANUAL OBRIGATÓRIA. Ano ausente NÃO é extrapolado: a verba
 * volta como NAO_CALCULAVEL. Falha ruidosa é melhor que número errado
 * silencioso — é o princípio que rege o motor inteiro.
 */
export const SALARIO_MINIMO_POR_ANO: Record<number, number> = {
  2023: 1320.0,
  2024: 1412.0,
  2025: 1518.0,
  2026: 1621.0,
};

export function salarioMinimoDoAno(ano: number): number | null {
  return SALARIO_MINIMO_POR_ANO[ano] ?? null;
}

/** Arredonda pra 2 casas. A folha arredonda VERBA A VERBA antes de somar. */
export function r2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
