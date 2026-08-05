// Cálculo de REFERÊNCIA da rescisão. Não é apuração oficial: o resultado
// existe pra ser comparado com o que a contabilidade informou no TRCT.
//
// Princípio que rege o arquivo: quando o motor não sabe, ele devolve
// NAO_CALCULAVEL com motivo — nunca zero. Zero é indistinguível de "não
// devido", e é aí que nasce passivo trabalhista.
//
// Cada verba carrega a fórmula legível e o fundamento legal, porque o valor
// sozinho é inauditável — o conferente precisa ver COMO chegou ali.

import {
  DIVISOR_MES,
  TERCO_CONSTITUCIONAL,
  FGTS_ALIQUOTA,
  FGTS_ALIQUOTA_APRENDIZ,
  FGTS_MULTA_PCT,
  INSALUBRIDADE_PCT,
  PERICULOSIDADE_PCT,
  FUNDAMENTO,
  MOTOR_VERSAO,
  diasDeFeriasPorFaltas,
  salarioMinimoDoAno,
  r2,
} from "./constantes";
import { MATRIZ, type MotivoCanonico } from "./motivos";
import {
  diasDeAvisoPrevio,
  dataProjetada,
  avosDecimoTerceiro,
  avosFeriasProporcionais,
  diasTrabalhadosNoMes,
} from "./avos";
import type { RescisaoConfig } from "./config";

export type SituacaoVerba = "CALCULADO" | "NAO_DEVIDA" | "NAO_CALCULAVEL" | "DESABILITADA_CONFIG";
export type Confianca = "ALTA" | "MEDIA" | "BAIXA";

export type VerbaCalculada = {
  itemKey: string;
  situacao: SituacaoVerba;
  valor: number | null;
  formula: string | null;
  fundamento: string | null;
  motivo: string | null;
  premissas: string[];
  confianca: Confianca;
};

export type PeriodoFerias = {
  /** Início do período aquisitivo. */
  inicio: Date;
  fim: Date;
  /** Dias de direito já apurados (default 30, reduzido por faltas). */
  dias?: number;
};

export type RescisaoInput = {
  motivo: MotivoCanonico;
  admissao: Date;
  desligamento: Date;
  /** INDENIZADO projeta o tempo de serviço; TRABALHADO já entra na folha. */
  avisoIndenizado: boolean;
  avisoDispensado: boolean;
  salarioBase: number | null;
  /** Períodos aquisitivos completos e não gozados. */
  feriasVencidas: PeriodoFerias[];
  /** Início do período aquisitivo em curso. */
  inicioPeriodoAquisitivoAtual: Date | null;
  faltasInjustificadas: number | null;
  mediaVariaveis: number | null;
  saldoFgtsInformado: number | null;
  decimoTerceiroAdiantado: number | null;
  aprendiz: boolean;
};

export type RescisaoCalculo = {
  verbas: Record<string, VerbaCalculada>;
  totalProventos: number;
  totalDescontos: number;
  inputsFaltantes: string[];
  motorVersao: string;
};

// ─── helpers de construção ───────────────────────────────────────────────────

function calculado(
  itemKey: string,
  valor: number,
  formula: string,
  fundamento: string,
  premissas: string[] = [],
  confianca: Confianca = "ALTA"
): VerbaCalculada {
  return { itemKey, situacao: "CALCULADO", valor: r2(valor), formula, fundamento, motivo: null, premissas, confianca };
}

function naoDevida(itemKey: string, motivo: string, fundamento: string | null = null): VerbaCalculada {
  return { itemKey, situacao: "NAO_DEVIDA", valor: null, formula: null, fundamento, motivo, premissas: [], confianca: "ALTA" };
}

function naoCalculavel(itemKey: string, motivo: string): VerbaCalculada {
  return { itemKey, situacao: "NAO_CALCULAVEL", valor: null, formula: null, fundamento: null, motivo, premissas: [], confianca: "BAIXA" };
}

// ─── base de cálculo ─────────────────────────────────────────────────────────

/**
 * Remuneração base = salário + adicionais + média de variáveis. Férias e 13º
 * incidem sobre a remuneração, não sobre o salário nu (Súm. 45/60/347 TST).
 */
function remuneracaoBase(
  input: RescisaoInput,
  config: RescisaoConfig
): { valor: number | null; partes: string[]; premissas: string[]; confianca: Confianca } {
  if (input.salarioBase == null) {
    return { valor: null, partes: [], premissas: [], confianca: "BAIXA" };
  }

  const partes = [`salário R$ ${input.salarioBase.toFixed(2)}`];
  const premissas: string[] = [];
  let confianca: Confianca = "ALTA";
  let total = input.salarioBase;

  // Insalubridade — o percentual do grau é fixo em lei; a base varia.
  const pctInsalubridade = INSALUBRIDADE_PCT[config.insalubridadeGrau];
  if (pctInsalubridade > 0) {
    let base: number | null = null;
    if (config.insalubridadeBase === "SALARIO_BASE") {
      base = input.salarioBase;
    } else if (config.insalubridadeBase === "SALARIO_MINIMO") {
      base = salarioMinimoDoAno(input.desligamento.getUTCFullYear());
    }
    if (base == null) {
      // Ano fora da tabela ou base de piso não informada: não extrapola.
      premissas.push("insalubridade não somada — base indisponível para o ano do desligamento");
      confianca = "MEDIA";
    } else {
      const valor = base * pctInsalubridade;
      total += valor;
      partes.push(`insalubridade ${(pctInsalubridade * 100).toFixed(0)}% = R$ ${valor.toFixed(2)}`);
    }
  }

  if (config.periculosidadeAplica) {
    const base = config.periculosidadeIntegral ? total : input.salarioBase;
    const valor = base * PERICULOSIDADE_PCT;
    total += valor;
    partes.push(`periculosidade 30% = R$ ${valor.toFixed(2)}`);
  }

  if (input.mediaVariaveis != null && input.mediaVariaveis > 0) {
    total += input.mediaVariaveis;
    partes.push(`média de variáveis R$ ${input.mediaVariaveis.toFixed(2)}`);
    premissas.push(`médias apuradas em ${config.mediaMeses} meses`);
  } else {
    premissas.push("sem lançamentos de folha no período — médias de variáveis não somadas");
    confianca = confianca === "ALTA" ? "MEDIA" : confianca;
  }

  return { valor: total, partes, premissas, confianca };
}

// ─── motor ───────────────────────────────────────────────────────────────────

export function calcularRescisao(input: RescisaoInput, config: RescisaoConfig): RescisaoCalculo {
  const matriz = MATRIZ[input.motivo];
  const verbas: Record<string, VerbaCalculada> = {};
  const inputsFaltantes: string[] = [];

  const base = remuneracaoBase(input, config);
  if (input.salarioBase == null) inputsFaltantes.push("Salário base do colaborador não cadastrado.");

  const remuneracao = base.valor;
  const formulaBase = base.partes.join(" + ");

  // Aviso prévio: define a data que projeta o tempo de serviço.
  const diasAviso = diasDeAvisoPrevio(input.admissao, input.desligamento);
  const projeta = input.avisoIndenizado && matriz.aviso_previo.tratamento === "A_RECEBER";
  const dataParaAvos = projeta ? dataProjetada(input.desligamento, diasAviso) : input.desligamento;

  const set = (v: VerbaCalculada) => {
    // Verba desabilitada na config NÃO some da tela: mostra o valor que teria
    // sido calculado, pra ninguém esconder verba devida sem querer.
    if (config.verbasDesabilitadas.includes(v.itemKey)) {
      verbas[v.itemKey] = {
        ...v,
        situacao: "DESABILITADA_CONFIG",
        motivo: "Desabilitada na configuração da empresa.",
      };
      return;
    }
    verbas[v.itemKey] = v;
  };

  // ── saldo de salário ──
  if (remuneracao == null) {
    set(naoCalculavel("saldo_salario", "Salário base não cadastrado."));
  } else {
    const dias = diasTrabalhadosNoMes(input.desligamento, input.admissao);
    const valor = (remuneracao / DIVISOR_MES) * dias;
    set(
      calculado(
        "saldo_salario",
        valor,
        `R$ ${remuneracao.toFixed(2)} ÷ ${DIVISOR_MES} × ${dias} dias = R$ ${r2(valor).toFixed(2)}`,
        FUNDAMENTO.DIVISOR_MES,
        [...base.premissas, `base: ${formulaBase}`],
        base.confianca
      )
    );
  }

  // ── férias vencidas ──
  const faltas = input.faltasInjustificadas;
  const premissaFaltas =
    faltas == null ? ["faltas injustificadas não informadas — assumido 0"] : [`${faltas} falta(s) injustificada(s)`];
  const diasDireito = diasDeFeriasPorFaltas(faltas ?? 0);

  let valorFeriasVencidas = 0;
  if (!matriz.ferias_vencidas.devida) {
    set(naoDevida("ferias_vencidas", matriz.ferias_vencidas.motivo!, matriz.ferias_vencidas.fundamento ?? null));
  } else if (remuneracao == null) {
    set(naoCalculavel("ferias_vencidas", "Salário base não cadastrado."));
  } else if (input.feriasVencidas.length === 0) {
    set(
      calculado(
        "ferias_vencidas",
        0,
        "Nenhum período aquisitivo vencido em aberto",
        matriz.ferias_vencidas.fundamento ?? FUNDAMENTO.FERIAS_VENCIDAS,
        premissaFaltas
      )
    );
  } else {
    valorFeriasVencidas = input.feriasVencidas.reduce((sum, p) => {
      const dias = p.dias ?? diasDireito;
      return sum + (remuneracao / DIVISOR_MES) * dias;
    }, 0);
    const totalDias = input.feriasVencidas.reduce((s, p) => s + (p.dias ?? diasDireito), 0);
    set(
      calculado(
        "ferias_vencidas",
        valorFeriasVencidas,
        `${input.feriasVencidas.length} período(s) × ${totalDias} dias: R$ ${remuneracao.toFixed(2)} ÷ ${DIVISOR_MES} × ${totalDias} = R$ ${r2(valorFeriasVencidas).toFixed(2)}`,
        matriz.ferias_vencidas.fundamento ?? FUNDAMENTO.FERIAS_VENCIDAS,
        [...premissaFaltas, ...base.premissas],
        base.confianca
      )
    );
  }

  // ── férias proporcionais ──
  let valorFeriasProp = 0;
  if (!matriz.ferias_proporcionais.devida) {
    set(naoDevida("ferias_proporcionais", matriz.ferias_proporcionais.motivo!, matriz.ferias_proporcionais.fundamento ?? null));
  } else if (remuneracao == null) {
    set(naoCalculavel("ferias_proporcionais", "Salário base não cadastrado."));
  } else if (input.inicioPeriodoAquisitivoAtual == null) {
    set(naoCalculavel("ferias_proporcionais", "Período aquisitivo em curso não identificado no módulo de Férias."));
    inputsFaltantes.push("Cadastre o período aquisitivo em curso no módulo de Férias.");
  } else {
    const avos = avosFeriasProporcionais(input.inicioPeriodoAquisitivoAtual, dataParaAvos);
    valorFeriasProp = (remuneracao / 12) * avos;
    set(
      calculado(
        "ferias_proporcionais",
        valorFeriasProp,
        `R$ ${remuneracao.toFixed(2)} ÷ 12 × ${avos}/12 avos = R$ ${r2(valorFeriasProp).toFixed(2)}`,
        FUNDAMENTO.FERIAS_PROPORCIONAIS,
        [
          ...base.premissas,
          projeta ? `avos contados até a data projetada pelo aviso (${dataParaAvos.toISOString().slice(0, 10)})` : "avos contados até o desligamento",
        ],
        base.confianca
      )
    );
  }

  // ── 1/3 constitucional ──
  if (!config.tercoApresentadoSeparado) {
    set(
      naoDevida(
        "terco_constitucional",
        "A contabilidade apresenta o 1/3 embutido nas férias (configuração da empresa).",
        FUNDAMENTO.TERCO
      )
    );
  } else {
    const baseTerco = valorFeriasVencidas + valorFeriasProp;
    if (baseTerco === 0) {
      set(calculado("terco_constitucional", 0, "Sem férias a receber — 1/3 não incide", FUNDAMENTO.TERCO));
    } else {
      const valor = baseTerco * TERCO_CONSTITUCIONAL;
      set(
        calculado(
          "terco_constitucional",
          valor,
          `(R$ ${r2(valorFeriasVencidas).toFixed(2)} + R$ ${r2(valorFeriasProp).toFixed(2)}) ÷ 3 = R$ ${r2(valor).toFixed(2)}`,
          FUNDAMENTO.TERCO,
          [],
          base.confianca
        )
      );
    }
  }

  // ── 13º proporcional ──
  if (!matriz.decimo_terceiro.devida) {
    set(naoDevida("decimo_terceiro", matriz.decimo_terceiro.motivo!, matriz.decimo_terceiro.fundamento ?? null));
  } else if (remuneracao == null) {
    set(naoCalculavel("decimo_terceiro", "Salário base não cadastrado."));
  } else {
    const avos = avosDecimoTerceiro(input.admissao, dataParaAvos);
    const bruto = (remuneracao / 12) * avos;
    const adiantado = input.decimoTerceiroAdiantado ?? 0;
    const valor = bruto - adiantado;
    const premissas = [...base.premissas];
    if (input.decimoTerceiroAdiantado == null) premissas.push("adiantamento de 13º não informado — assumido 0");
    if (projeta) premissas.push(`avos contados até a data projetada (${dataParaAvos.toISOString().slice(0, 10)})`);
    set(
      calculado(
        "decimo_terceiro",
        valor,
        `R$ ${remuneracao.toFixed(2)} ÷ 12 × ${avos}/12 avos${adiantado > 0 ? ` − adiantado R$ ${adiantado.toFixed(2)}` : ""} = R$ ${r2(valor).toFixed(2)}`,
        FUNDAMENTO.DECIMO_TERCEIRO,
        premissas,
        base.confianca
      )
    );
  }

  // ── aviso prévio ──
  const tratamento = matriz.aviso_previo.tratamento;
  if (tratamento === "NAO_HA") {
    set(naoDevida("aviso_previo", matriz.aviso_previo.motivo!, matriz.aviso_previo.fundamento ?? null));
  } else if (remuneracao == null) {
    set(naoCalculavel("aviso_previo", "Salário base não cadastrado."));
  } else if (input.avisoDispensado) {
    set(naoDevida("aviso_previo", "Aviso prévio dispensado pelas partes.", FUNDAMENTO.AVISO_BASE));
  } else if (tratamento === "A_RECEBER" && !input.avisoIndenizado) {
    set(
      naoDevida(
        "aviso_previo",
        "Aviso trabalhado — remuneração entra na folha do período, não como verba rescisória.",
        FUNDAMENTO.AVISO_BASE
      )
    );
  } else {
    const fator = tratamento === "METADE" ? 0.5 : 1;
    const valor = (remuneracao / DIVISOR_MES) * diasAviso * fator;
    const sinal = tratamento === "DESCONTO" ? -1 : 1;
    const rotulo =
      tratamento === "DESCONTO"
        ? "desconto do aviso não cumprido"
        : tratamento === "METADE"
          ? "metade do aviso indenizado (acordo)"
          : "aviso indenizado";
    set(
      calculado(
        "aviso_previo",
        valor * sinal,
        `${rotulo}: R$ ${remuneracao.toFixed(2)} ÷ ${DIVISOR_MES} × ${diasAviso} dias${fator !== 1 ? " × 50%" : ""} = R$ ${r2(valor * sinal).toFixed(2)}`,
        tratamento === "DESCONTO" ? FUNDAMENTO.AVISO_DESCONTO : FUNDAMENTO.AVISO_PROPORCIONAL,
        tratamento === "DESCONTO" ? ["desconto fixo de 30 dias — proporcionalidade beneficia só o empregado"] : [],
        base.confianca
      )
    );
  }

  // ── FGTS depósito ──
  const aliquota = input.aprendiz ? FGTS_ALIQUOTA_APRENDIZ : FGTS_ALIQUOTA;
  if (remuneracao == null) {
    set(naoCalculavel("fgts_deposito", "Salário base não cadastrado."));
  } else {
    const valor = remuneracao * aliquota;
    set(
      calculado(
        "fgts_deposito",
        valor,
        `R$ ${remuneracao.toFixed(2)} × ${(aliquota * 100).toFixed(0)}% = R$ ${r2(valor).toFixed(2)} (referente ao mês)`,
        FUNDAMENTO.FGTS_DEPOSITO,
        ["valor do mês corrente — não é o total do contrato"],
        "MEDIA"
      )
    );
  }

  // ── FGTS multa ──
  const pctMulta = FGTS_MULTA_PCT[input.motivo];
  if (!matriz.fgts_multa.devida) {
    set(naoDevida("fgts_multa", matriz.fgts_multa.motivo!, matriz.fgts_multa.fundamento ?? null));
  } else if (input.saldoFgtsInformado == null) {
    // A base é o saldo da conta vinculada corrigido — dado da CAIXA que o
    // Connect não tem como obter. Pede o insumo em vez de chutar.
    set(naoCalculavel("fgts_multa", "Informe o saldo do FGTS para calcular a multa rescisória."));
    inputsFaltantes.push("Saldo do FGTS (extrato da CAIXA) — necessário para estimar a multa rescisória.");
  } else {
    const valor = input.saldoFgtsInformado * pctMulta;
    set(
      calculado(
        "fgts_multa",
        valor,
        `R$ ${input.saldoFgtsInformado.toFixed(2)} × ${(pctMulta * 100).toFixed(0)}% = R$ ${r2(valor).toFixed(2)}`,
        matriz.fgts_multa.fundamento ?? FUNDAMENTO.FGTS_MULTA,
        ["sobre o saldo informado, sem correção monetária adicional (JAM)"],
        "MEDIA"
      )
    );
  }

  // ── INSS/IRRF: fora do escopo v1, com motivo explícito ──
  set(
    naoCalculavel(
      "inss_irrf",
      "Não calculado: as tabelas mudam por portaria anual e a incidência na rescisão tem muitas exceções (aviso indenizado sem INSS, férias indenizadas isentas de IR). Confira direto no TRCT."
    )
  );

  // ── totais ──
  let totalProventos = 0;
  let totalDescontos = 0;
  for (const v of Object.values(verbas)) {
    if (v.situacao !== "CALCULADO" || v.valor == null) continue;
    if (v.valor >= 0) totalProventos += v.valor;
    else totalDescontos += Math.abs(v.valor);
  }

  return {
    verbas,
    totalProventos: r2(totalProventos),
    totalDescontos: r2(totalDescontos),
    inputsFaltantes,
    motorVersao: MOTOR_VERSAO,
  };
}
