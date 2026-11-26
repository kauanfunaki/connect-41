// As rubricas do DP 2 (11/11/2026): a lista padrão que todo escritório ganha no
// primeiro acesso e o vocabulário que o motor entende.
//
// Rubrica com `papel` é do motor: ele sabe calcular (salário do mês, hora extra
// pela convenção, INSS pela tabela…). Rubrica sem papel é livre: o DP informa o
// valor e o motor só soma, respeitando as incidências marcadas nela.
//
// Puro, sem banco.

export type TipoDaRubrica = "PROVENTO" | "DESCONTO" | "INFORMATIVA";
export type LancamentoDaRubrica = "VALOR" | "HORAS" | "DIAS";

export type PapelDaRubrica =
  | "SALARIO"
  | "HE50"
  | "HE100"
  | "NOTURNO"
  | "DSR"
  | "INSALUBRIDADE"
  | "PERICULOSIDADE"
  | "SALARIO_FAMILIA"
  | "FALTA"
  | "DSR_FALTA"
  | "ATRASO"
  | "INSS"
  | "IRRF"
  | "VALE_TRANSPORTE"
  | "ADIANTAMENTO"
  | "PENSAO"
  | "PREVIDENCIA_COMPLEMENTAR"
  | "CONTRIBUICAO_SINDICAL"
  | "FGTS"
  | "DECIMO_PRIMEIRA"
  | "DECIMO_SEGUNDA"
  | "DECIMO_ADIANTADO"
  | "INSS_DECIMO"
  | "IRRF_DECIMO"
  // Rescisão (12/11/2026, eSocial S-2299): as verbas que só existem no desligamento.
  | "AVISO_INDENIZADO"
  | "AVISO_DESCONTO"
  | "FERIAS_VENCIDAS_INDENIZADAS"
  | "FERIAS_PROPORC_INDENIZADAS"
  | "TERCO_FERIAS_INDENIZADAS"
  // Férias gozadas lançadas na folha do mês (25/11/2026, funcionalidade-745).
  | "FERIAS_GOZADAS"
  | "TERCO_FERIAS"
  | "ABONO_FERIAS"
  | "TERCO_ABONO_FERIAS"
  | "FERIAS_LIQUIDO_PAGO"
  | "IRRF_FERIAS"
  // Trabalhador sem vínculo (12/11/2026, fase 3d): o valor do mês de cada categoria.
  | "PRO_LABORE"
  | "BOLSA_ESTAGIO"
  | "SERVICO_AUTONOMO"
  // Diferenças de meses anteriores (26/11/2026, funcionalidade-760): pagas no mês,
  // com o INSS apurado mês a mês (vai no infoPerAnt do S-1200).
  | "DIFERENCA_RETROATIVA"
  | "INSS_DIFERENCA"
  | "SALARIO_FAMILIA_RETROATIVO";

/** A rubrica como o motor a recebe. */
export type RubricaDoMotor = {
  codigo: string;
  nome: string;
  tipo: TipoDaRubrica;
  papel: PapelDaRubrica | null;
  lancamento: LancamentoDaRubrica;
  incideInss: boolean;
  incideFgts: boolean;
  incideIrrf: boolean;
  /** Entra na média de férias, de 13º e de rescisão (17/11/2026, melhoria-742). */
  mediaFerias: boolean;
  mediaDecimo: boolean;
  mediaRescisao: boolean;
};

export const TIPOS_DE_RUBRICA: readonly TipoDaRubrica[] = ["PROVENTO", "DESCONTO", "INFORMATIVA"];
export const LANCAMENTOS: readonly LancamentoDaRubrica[] = ["VALOR", "HORAS", "DIAS"];

export const NOME_DO_TIPO: Record<TipoDaRubrica, string> = {
  PROVENTO: "Provento",
  DESCONTO: "Desconto",
  INFORMATIVA: "Informativa",
};

export const NOME_DO_LANCAMENTO: Record<LancamentoDaRubrica, string> = {
  VALOR: "Valor (R$)",
  HORAS: "Horas",
  DIAS: "Dias",
};

/**
 * Os papéis que o DP lança no mês (os outros o motor calcula sozinho). Lançar
 * horas numa rubrica de valor, ou o contrário, não faz sentido: a tela de
 * eventos só oferece estes e as rubricas livres.
 */
export const PAPEIS_LANCAVEIS: ReadonlySet<PapelDaRubrica> = new Set([
  "HE50",
  "HE100",
  "NOTURNO",
  "FALTA",
  "DSR_FALTA",
  "ATRASO",
  "ADIANTAMENTO",
  "PENSAO",
  "SERVICO_AUTONOMO",
]);

type Padrao = Omit<RubricaDoMotor, "incideInss" | "incideFgts" | "incideIrrf" | "mediaFerias" | "mediaDecimo" | "mediaRescisao"> & {
  /** INSS_IRRF: contribuinte individual (sem FGTS); SO_IRRF: bolsa de estágio. */
  incide: "TODAS" | "NENHUMA" | "SO_FGTS" | "INSS_IRRF" | "SO_IRRF" | "INSS_FGTS";
  entraNaMedia?: boolean;
};

const PADRAO: Padrao[] = [
  { codigo: "001", nome: "Salário", tipo: "PROVENTO", papel: "SALARIO", lancamento: "VALOR", incide: "TODAS" },
  { codigo: "002", nome: "Horas extras 50%", tipo: "PROVENTO", papel: "HE50", lancamento: "HORAS", incide: "TODAS", entraNaMedia: true },
  { codigo: "003", nome: "Horas extras 100%", tipo: "PROVENTO", papel: "HE100", lancamento: "HORAS", incide: "TODAS", entraNaMedia: true },
  { codigo: "004", nome: "Adicional noturno", tipo: "PROVENTO", papel: "NOTURNO", lancamento: "HORAS", incide: "TODAS", entraNaMedia: true },
  { codigo: "005", nome: "DSR sobre variáveis", tipo: "PROVENTO", papel: "DSR", lancamento: "VALOR", incide: "TODAS", entraNaMedia: true },
  { codigo: "006", nome: "Adicional de insalubridade", tipo: "PROVENTO", papel: "INSALUBRIDADE", lancamento: "VALOR", incide: "TODAS" },
  { codigo: "007", nome: "Adicional de periculosidade", tipo: "PROVENTO", papel: "PERICULOSIDADE", lancamento: "VALOR", incide: "TODAS" },
  { codigo: "008", nome: "Salário-família", tipo: "PROVENTO", papel: "SALARIO_FAMILIA", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "009", nome: "Comissões", tipo: "PROVENTO", papel: null, lancamento: "VALOR", incide: "TODAS", entraNaMedia: true },
  { codigo: "010", nome: "Gratificação", tipo: "PROVENTO", papel: null, lancamento: "VALOR", incide: "TODAS", entraNaMedia: true },
  { codigo: "011", nome: "Prêmio", tipo: "PROVENTO", papel: null, lancamento: "VALOR", incide: "NENHUMA" },
  // Diferenças retroativas (funcionalidade-760): o INSS sai mês a mês na rubrica 066, não na base do mês.
  { codigo: "012", nome: "Diferenças salariais retroativas", tipo: "PROVENTO", papel: "DIFERENCA_RETROATIVA", lancamento: "VALOR", incide: "TODAS" },
  { codigo: "013", nome: "Salário-família retroativo", tipo: "PROVENTO", papel: "SALARIO_FAMILIA_RETROATIVO", lancamento: "VALOR", incide: "NENHUMA" },
  // Férias na folha do mês (funcionalidade-745): o IRRF das férias é separado,
  // então férias e 1/3 entram no INSS e no FGTS do mês, mas não no IRRF.
  { codigo: "040", nome: "Férias", tipo: "PROVENTO", papel: "FERIAS_GOZADAS", lancamento: "VALOR", incide: "INSS_FGTS" },
  { codigo: "041", nome: "1/3 de férias", tipo: "PROVENTO", papel: "TERCO_FERIAS", lancamento: "VALOR", incide: "INSS_FGTS" },
  { codigo: "042", nome: "Abono pecuniário de férias", tipo: "PROVENTO", papel: "ABONO_FERIAS", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "043", nome: "1/3 do abono de férias", tipo: "PROVENTO", papel: "TERCO_ABONO_FERIAS", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "044", nome: "Líquido de férias pago", tipo: "DESCONTO", papel: "FERIAS_LIQUIDO_PAGO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "045", nome: "IRRF sobre férias", tipo: "DESCONTO", papel: "IRRF_FERIAS", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "050", nome: "Faltas", tipo: "DESCONTO", papel: "FALTA", lancamento: "DIAS", incide: "TODAS" },
  { codigo: "051", nome: "DSR das faltas", tipo: "DESCONTO", papel: "DSR_FALTA", lancamento: "DIAS", incide: "TODAS" },
  { codigo: "052", nome: "Atrasos", tipo: "DESCONTO", papel: "ATRASO", lancamento: "HORAS", incide: "TODAS" },
  { codigo: "053", nome: "INSS", tipo: "DESCONTO", papel: "INSS", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "054", nome: "IRRF", tipo: "DESCONTO", papel: "IRRF", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "055", nome: "Vale-transporte", tipo: "DESCONTO", papel: "VALE_TRANSPORTE", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "056", nome: "Adiantamento salarial", tipo: "DESCONTO", papel: "ADIANTAMENTO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "057", nome: "Pensão alimentícia", tipo: "DESCONTO", papel: "PENSAO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "058", nome: "Desconto diverso", tipo: "DESCONTO", papel: null, lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "059", nome: "Contribuição sindical", tipo: "DESCONTO", papel: "CONTRIBUICAO_SINDICAL", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "060", nome: "13º salário — 1ª parcela", tipo: "PROVENTO", papel: "DECIMO_PRIMEIRA", lancamento: "VALOR", incide: "SO_FGTS" },
  { codigo: "061", nome: "13º salário", tipo: "PROVENTO", papel: "DECIMO_SEGUNDA", lancamento: "VALOR", incide: "SO_FGTS" },
  { codigo: "062", nome: "Adiantamento do 13º", tipo: "DESCONTO", papel: "DECIMO_ADIANTADO", lancamento: "VALOR", incide: "SO_FGTS" },
  { codigo: "063", nome: "INSS sobre o 13º", tipo: "DESCONTO", papel: "INSS_DECIMO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "064", nome: "IRRF sobre o 13º", tipo: "DESCONTO", papel: "IRRF_DECIMO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "065", nome: "Previdência complementar", tipo: "DESCONTO", papel: "PREVIDENCIA_COMPLEMENTAR", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "066", nome: "INSS sobre diferenças retroativas", tipo: "DESCONTO", papel: "INSS_DIFERENCA", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "070", nome: "Aviso prévio indenizado", tipo: "PROVENTO", papel: "AVISO_INDENIZADO", lancamento: "VALOR", incide: "SO_FGTS" },
  { codigo: "071", nome: "Desconto do aviso prévio", tipo: "DESCONTO", papel: "AVISO_DESCONTO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "072", nome: "Férias vencidas indenizadas", tipo: "PROVENTO", papel: "FERIAS_VENCIDAS_INDENIZADAS", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "073", nome: "Férias proporcionais indenizadas", tipo: "PROVENTO", papel: "FERIAS_PROPORC_INDENIZADAS", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "074", nome: "1/3 sobre férias indenizadas", tipo: "PROVENTO", papel: "TERCO_FERIAS_INDENIZADAS", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "080", nome: "Pró-labore", tipo: "PROVENTO", papel: "PRO_LABORE", lancamento: "VALOR", incide: "INSS_IRRF" },
  { codigo: "081", nome: "Bolsa de estágio", tipo: "PROVENTO", papel: "BOLSA_ESTAGIO", lancamento: "VALOR", incide: "SO_IRRF" },
  { codigo: "082", nome: "Serviço prestado (RPA)", tipo: "PROVENTO", papel: "SERVICO_AUTONOMO", lancamento: "VALOR", incide: "INSS_IRRF" },
  { codigo: "090", nome: "FGTS do mês", tipo: "INFORMATIVA", papel: "FGTS", lancamento: "VALOR", incide: "NENHUMA" },
];

/** As rubricas que todo escritório ganha no primeiro acesso ao DP 2. */
export const RUBRICAS_PADRAO: readonly RubricaDoMotor[] = PADRAO.map(({ incide, entraNaMedia, ...r }) => ({
  ...r,
  incideInss: incide === "TODAS" || incide === "INSS_IRRF" || incide === "INSS_FGTS",
  incideFgts: incide === "TODAS" || incide === "SO_FGTS" || incide === "INSS_FGTS",
  incideIrrf: incide === "TODAS" || incide === "INSS_IRRF" || incide === "SO_IRRF",
  // As variáveis da lista padrão entram nas três médias; o escritório separa depois.
  mediaFerias: entraNaMedia ?? false,
  mediaDecimo: entraNaMedia ?? false,
  mediaRescisao: entraNaMedia ?? false,
}));

export const PAPEIS: ReadonlySet<string> = new Set(RUBRICAS_PADRAO.map((r) => r.papel).filter((p): p is PapelDaRubrica => p !== null));

export function ehPapel(v: unknown): v is PapelDaRubrica {
  return typeof v === "string" && PAPEIS.has(v);
}

/**
 * Se a rubrica pode ser lançada pelo DP (no mês ou como fixa do contrato) e se
 * vai por quantidade (horas ou dias) ou por valor (19/11/2026, funcionalidade-767).
 */
export function regraDeLancamento(r: { papel: string | null; tipo: string; lancamento: string }): { lancavel: boolean; porQuantidade: boolean } {
  const lancavel = r.papel ? ehPapel(r.papel) && PAPEIS_LANCAVEIS.has(r.papel) : r.tipo !== "INFORMATIVA";
  return { lancavel, porQuantidade: r.papel !== null && r.lancamento !== "VALOR" };
}

/**
 * As rubricas do motor que o escritório ainda não tem (pelo papel): a
 * semeadura do primeiro acesso, e a de quando uma rubrica de papel nova entra
 * no código. As livres da lista padrão só entram na primeira vez.
 */
export function rubricasQueFaltam(existentes: readonly { codigo: string; papel: string | null }[]): RubricaDoMotor[] {
  const papeis = new Set(existentes.map((r) => r.papel).filter(Boolean));
  const codigos = new Set(existentes.map((r) => r.codigo));
  const primeiraVez = existentes.length === 0;
  return RUBRICAS_PADRAO.filter((r) => {
    if (r.papel === null) return primeiraVez;
    if (papeis.has(r.papel)) return false;
    return !codigos.has(r.codigo) || primeiraVez;
  });
}
