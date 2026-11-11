// As tabelas oficiais do DP 2 (11/11/2026) — INSS, IRRF, salário mínimo e
// salário-família, cada uma com a competência em que passa a valer.
//
// As tabelas da lei moram aqui, no código, e valem para todo escritório. O
// escritório pode gravar uma versão sua (`Dp2TabelaOficial`) quando a lei muda
// antes de o código ser atualizado: na mesma vigência, a dele ganha.
//
// ⚠️ MANUTENÇÃO ANUAL: todo janeiro (INSS, mínimo, salário-família) e sempre
// que a Receita mudar o IRRF. Competência anterior à primeira tabela não é
// extrapolada: o cálculo para e diz qual tabela falta.
//
// Puro, sem banco.

export type TipoDeTabela = "INSS" | "IRRF" | "SALARIO_MINIMO" | "SALARIO_FAMILIA";

export const TIPOS_DE_TABELA: readonly TipoDeTabela[] = ["INSS", "IRRF", "SALARIO_MINIMO", "SALARIO_FAMILIA"];

export const NOME_DA_TABELA: Record<TipoDeTabela, string> = {
  INSS: "INSS do empregado",
  IRRF: "IRRF mensal",
  SALARIO_MINIMO: "Salário mínimo",
  SALARIO_FAMILIA: "Salário-família",
};

/** Faixas progressivas: cada uma vai até `ate`; a última é o teto. Alíquota em %. */
export type TabelaInss = { faixas: { ate: number; aliquota: number }[] };

/**
 * Faixas da tabela progressiva (`ate` nulo = acima da anterior), dedução por
 * dependente, desconto simplificado e a redução da Lei 15.270/2025 (a partir de
 * 2026), que zera o imposto até R$ 5.000 e reduz até R$ 7.350.
 */
export type TabelaIrrf = {
  faixas: { ate: number | null; aliquota: number; deducao: number }[];
  deducaoDependente: number;
  descontoSimplificado: number;
  /** Abaixo disto o imposto não é retido (IN RFB 1.500/2014, art. 67). */
  minimoRetencao: number;
  reducao?: {
    /** Rendimentos até aqui: o imposto zera (redução até `reducaoMaxima`). */
    isentoAte: number;
    reducaoMaxima: number;
    /** Rendimentos até aqui: redução = constante − fator × rendimentos. */
    ate: number;
    constante: number;
    fator: number;
    /** Se a redução vale também para o 13º (tributação exclusiva). */
    noDecimo: boolean;
  };
};

export type TabelaSalarioMinimo = { valor: number };
export type TabelaSalarioFamilia = { limite: number; cota: number };

export type DadosDaTabela = {
  INSS: TabelaInss;
  IRRF: TabelaIrrf;
  SALARIO_MINIMO: TabelaSalarioMinimo;
  SALARIO_FAMILIA: TabelaSalarioFamilia;
};

export type VersaoDaTabela<T extends TipoDeTabela = TipoDeTabela> = {
  tipo: T;
  /** "AAAA-MM": a primeira competência em que vale. */
  vigencia: string;
  dados: DadosDaTabela[T];
  /** De onde veio: o código (a lei) ou o escritório. */
  origem: "LEI" | "ESCRITORIO";
  fundamento: string;
};

const IRRF_TABELA_2025_05 = [
  { ate: 2428.8, aliquota: 0, deducao: 0 },
  { ate: 2826.65, aliquota: 7.5, deducao: 182.16 },
  { ate: 3751.05, aliquota: 15, deducao: 394.16 },
  { ate: 4664.68, aliquota: 22.5, deducao: 675.49 },
  { ate: null, aliquota: 27.5, deducao: 908.73 },
];

/** As tabelas da lei, da mais antiga para a mais nova em cada tipo. */
export const TABELAS_DA_LEI: readonly VersaoDaTabela[] = [
  {
    tipo: "INSS",
    vigencia: "2025-01",
    origem: "LEI",
    fundamento: "Portaria Interministerial MPS/MF nº 6/2025",
    dados: {
      faixas: [
        { ate: 1518.0, aliquota: 7.5 },
        { ate: 2793.88, aliquota: 9 },
        { ate: 4190.83, aliquota: 12 },
        { ate: 8157.41, aliquota: 14 },
      ],
    },
  },
  {
    tipo: "INSS",
    vigencia: "2026-01",
    origem: "LEI",
    fundamento: "Portaria Interministerial MPS/MF de janeiro/2026 (reajuste de 3,9%)",
    dados: {
      faixas: [
        { ate: 1621.0, aliquota: 7.5 },
        { ate: 2902.84, aliquota: 9 },
        { ate: 4354.27, aliquota: 12 },
        { ate: 8475.55, aliquota: 14 },
      ],
    },
  },
  {
    tipo: "IRRF",
    vigencia: "2025-01",
    origem: "LEI",
    fundamento: "Lei 14.848/2024 (tabela de fevereiro/2024)",
    dados: {
      faixas: [
        { ate: 2259.2, aliquota: 0, deducao: 0 },
        { ate: 2826.65, aliquota: 7.5, deducao: 169.44 },
        { ate: 3751.05, aliquota: 15, deducao: 381.44 },
        { ate: 4664.68, aliquota: 22.5, deducao: 662.77 },
        { ate: null, aliquota: 27.5, deducao: 896.0 },
      ],
      deducaoDependente: 189.59,
      descontoSimplificado: 564.8,
      minimoRetencao: 10,
    },
  },
  {
    tipo: "IRRF",
    vigencia: "2025-05",
    origem: "LEI",
    fundamento: "Lei 15.191/2025 (MP 1.294/2025)",
    dados: { faixas: IRRF_TABELA_2025_05, deducaoDependente: 189.59, descontoSimplificado: 607.2, minimoRetencao: 10 },
  },
  {
    tipo: "IRRF",
    vigencia: "2026-01",
    origem: "LEI",
    fundamento: "Lei 15.270/2025 (redução até R$ 5.000 e parcial até R$ 7.350)",
    dados: {
      faixas: IRRF_TABELA_2025_05,
      deducaoDependente: 189.59,
      descontoSimplificado: 607.2,
      minimoRetencao: 10,
      reducao: { isentoAte: 5000, reducaoMaxima: 312.89, ate: 7350, constante: 978.62, fator: 0.133145, noDecimo: false },
    },
  },
  { tipo: "SALARIO_MINIMO", vigencia: "2025-01", origem: "LEI", fundamento: "Decreto 12.342/2024", dados: { valor: 1518.0 } },
  { tipo: "SALARIO_MINIMO", vigencia: "2026-01", origem: "LEI", fundamento: "Decreto de dezembro/2025", dados: { valor: 1621.0 } },
  {
    tipo: "SALARIO_FAMILIA",
    vigencia: "2025-01",
    origem: "LEI",
    fundamento: "Portaria Interministerial MPS/MF nº 6/2025",
    dados: { limite: 1906.04, cota: 65.0 },
  },
  {
    tipo: "SALARIO_FAMILIA",
    vigencia: "2026-01",
    origem: "LEI",
    fundamento: "Portaria Interministerial MPS/MF de janeiro/2026 (reajuste de 3,9%)",
    dados: { limite: 1980.38, cota: 67.54 },
  },
];

/** "AAAA-MM" de um ano e mês. */
export function competenciaDe(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/**
 * A versão que vale na competência: a de maior vigência até ela, juntando a
 * lei e o escritório (na mesma vigência, a do escritório). `null` quando não
 * há tabela tão antiga — o cálculo para, em vez de extrapolar.
 */
export function tabelaVigente<T extends TipoDeTabela>(
  tipo: T,
  competencia: string,
  doEscritorio: readonly VersaoDaTabela[] = []
): VersaoDaTabela<T> | null {
  let achada: VersaoDaTabela | null = null;
  for (const v of [...TABELAS_DA_LEI, ...doEscritorio]) {
    if (v.tipo !== tipo || v.vigencia > competencia) continue;
    if (achada === null || v.vigencia > achada.vigencia || (v.vigencia === achada.vigencia && v.origem === "ESCRITORIO")) achada = v;
  }
  return achada as VersaoDaTabela<T> | null;
}

export type TabelasDaCompetencia = {
  inss: VersaoDaTabela<"INSS">;
  irrf: VersaoDaTabela<"IRRF">;
  salarioMinimo: VersaoDaTabela<"SALARIO_MINIMO">;
  salarioFamilia: VersaoDaTabela<"SALARIO_FAMILIA">;
};

/** As quatro tabelas da competência, ou o nome das que faltam. */
export function tabelasDaCompetencia(
  competencia: string,
  doEscritorio: readonly VersaoDaTabela[] = []
): { ok: true; tabelas: TabelasDaCompetencia } | { ok: false; faltam: string[] } {
  const inss = tabelaVigente("INSS", competencia, doEscritorio);
  const irrf = tabelaVigente("IRRF", competencia, doEscritorio);
  const salarioMinimo = tabelaVigente("SALARIO_MINIMO", competencia, doEscritorio);
  const salarioFamilia = tabelaVigente("SALARIO_FAMILIA", competencia, doEscritorio);
  if (inss && irrf && salarioMinimo && salarioFamilia) return { ok: true, tabelas: { inss, irrf, salarioMinimo, salarioFamilia } };
  const faltam: string[] = [];
  if (!inss) faltam.push(NOME_DA_TABELA.INSS);
  if (!irrf) faltam.push(NOME_DA_TABELA.IRRF);
  if (!salarioMinimo) faltam.push(NOME_DA_TABELA.SALARIO_MINIMO);
  if (!salarioFamilia) faltam.push(NOME_DA_TABELA.SALARIO_FAMILIA);
  return { ok: false, faltam };
}

// ─── Leitura do que o escritório gravou ─────────────────────────────────────

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Confere o JSON de uma tabela gravada (pelo formulário ou pelo banco) e
 * devolve os dados no formato do tipo, ou o motivo de recusar. Faixas têm de
 * subir em ordem; alíquota entre 0 e 100.
 */
export function lerDadosDaTabela<T extends TipoDeTabela>(tipo: T, bruto: unknown): { ok: true; dados: DadosDaTabela[T] } | { ok: false; erro: string } {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const aliquotaOk = (a: number | null) => a !== null && a >= 0 && a <= 100;
  if (tipo === "SALARIO_MINIMO") {
    const valor = numero(o.valor);
    if (valor === null || valor <= 0) return { ok: false, erro: "Informe o valor do salário mínimo." };
    return { ok: true, dados: { valor } as DadosDaTabela[T] };
  }
  if (tipo === "SALARIO_FAMILIA") {
    const limite = numero(o.limite);
    const cota = numero(o.cota);
    if (limite === null || limite <= 0 || cota === null || cota <= 0) return { ok: false, erro: "Informe o limite de remuneração e o valor da cota." };
    return { ok: true, dados: { limite, cota } as DadosDaTabela[T] };
  }
  const faixasBrutas = Array.isArray(o.faixas) ? (o.faixas as Record<string, unknown>[]) : [];
  if (faixasBrutas.length === 0) return { ok: false, erro: "Informe ao menos uma faixa." };
  if (tipo === "INSS") {
    const faixas: TabelaInss["faixas"] = [];
    for (const f of faixasBrutas) {
      const ate = numero(f.ate);
      const aliquota = numero(f.aliquota);
      if (ate === null || ate <= 0 || !aliquotaOk(aliquota)) return { ok: false, erro: "Cada faixa do INSS precisa de limite e alíquota." };
      if (faixas.length > 0 && ate <= faixas[faixas.length - 1].ate) return { ok: false, erro: "Os limites das faixas precisam subir em ordem." };
      faixas.push({ ate, aliquota: aliquota! });
    }
    return { ok: true, dados: { faixas } as DadosDaTabela[T] };
  }
  const faixas: TabelaIrrf["faixas"] = [];
  faixasBrutas.forEach((f, i) => {
    const ultima = i === faixasBrutas.length - 1;
    faixas.push({ ate: ultima ? null : numero(f.ate), aliquota: numero(f.aliquota) ?? -1, deducao: numero(f.deducao) ?? 0 });
  });
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i];
    if (!aliquotaOk(f.aliquota)) return { ok: false, erro: "Cada faixa do IRRF precisa de alíquota." };
    if (i < faixas.length - 1) {
      if (f.ate === null || f.ate <= 0) return { ok: false, erro: "Só a última faixa do IRRF fica sem limite." };
      const anterior = i > 0 ? faixas[i - 1].ate : 0;
      if (anterior !== null && f.ate <= anterior) return { ok: false, erro: "Os limites das faixas precisam subir em ordem." };
    }
  }
  const deducaoDependente = numero(o.deducaoDependente);
  const descontoSimplificado = numero(o.descontoSimplificado);
  const minimoRetencao = numero(o.minimoRetencao) ?? 10;
  if (deducaoDependente === null || descontoSimplificado === null) return { ok: false, erro: "Informe a dedução por dependente e o desconto simplificado." };
  const r = o.reducao as Record<string, unknown> | undefined | null;
  let reducao: TabelaIrrf["reducao"];
  if (r && typeof r === "object") {
    const isentoAte = numero(r.isentoAte);
    const reducaoMaxima = numero(r.reducaoMaxima);
    const ate = numero(r.ate);
    const constante = numero(r.constante);
    const fator = numero(r.fator);
    if (isentoAte === null || reducaoMaxima === null || ate === null || constante === null || fator === null) {
      return { ok: false, erro: "A redução do IRRF precisa de todos os campos." };
    }
    reducao = { isentoAte, reducaoMaxima, ate, constante, fator, noDecimo: r.noDecimo === true };
  }
  return { ok: true, dados: { faixas, deducaoDependente, descontoSimplificado, minimoRetencao, ...(reducao ? { reducao } : {}) } as DadosDaTabela[T] };
}
