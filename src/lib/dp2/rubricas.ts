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
  | "FGTS"
  | "DECIMO_PRIMEIRA"
  | "DECIMO_SEGUNDA"
  | "DECIMO_ADIANTADO"
  | "INSS_DECIMO"
  | "IRRF_DECIMO";

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
  entraNaMedia: boolean;
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
]);

type Padrao = Omit<RubricaDoMotor, "incideInss" | "incideFgts" | "incideIrrf" | "entraNaMedia"> & {
  incide: "TODAS" | "NENHUMA" | "SO_FGTS";
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
  { codigo: "050", nome: "Faltas", tipo: "DESCONTO", papel: "FALTA", lancamento: "DIAS", incide: "TODAS" },
  { codigo: "051", nome: "DSR das faltas", tipo: "DESCONTO", papel: "DSR_FALTA", lancamento: "DIAS", incide: "TODAS" },
  { codigo: "052", nome: "Atrasos", tipo: "DESCONTO", papel: "ATRASO", lancamento: "HORAS", incide: "TODAS" },
  { codigo: "053", nome: "INSS", tipo: "DESCONTO", papel: "INSS", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "054", nome: "IRRF", tipo: "DESCONTO", papel: "IRRF", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "055", nome: "Vale-transporte", tipo: "DESCONTO", papel: "VALE_TRANSPORTE", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "056", nome: "Adiantamento salarial", tipo: "DESCONTO", papel: "ADIANTAMENTO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "057", nome: "Pensão alimentícia", tipo: "DESCONTO", papel: "PENSAO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "058", nome: "Desconto diverso", tipo: "DESCONTO", papel: null, lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "060", nome: "13º salário — 1ª parcela", tipo: "PROVENTO", papel: "DECIMO_PRIMEIRA", lancamento: "VALOR", incide: "SO_FGTS" },
  { codigo: "061", nome: "13º salário", tipo: "PROVENTO", papel: "DECIMO_SEGUNDA", lancamento: "VALOR", incide: "SO_FGTS" },
  { codigo: "062", nome: "Adiantamento do 13º", tipo: "DESCONTO", papel: "DECIMO_ADIANTADO", lancamento: "VALOR", incide: "SO_FGTS" },
  { codigo: "063", nome: "INSS sobre o 13º", tipo: "DESCONTO", papel: "INSS_DECIMO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "064", nome: "IRRF sobre o 13º", tipo: "DESCONTO", papel: "IRRF_DECIMO", lancamento: "VALOR", incide: "NENHUMA" },
  { codigo: "090", nome: "FGTS do mês", tipo: "INFORMATIVA", papel: "FGTS", lancamento: "VALOR", incide: "NENHUMA" },
];

/** As rubricas que todo escritório ganha no primeiro acesso ao DP 2. */
export const RUBRICAS_PADRAO: readonly RubricaDoMotor[] = PADRAO.map(({ incide, entraNaMedia, ...r }) => ({
  ...r,
  incideInss: incide === "TODAS",
  incideFgts: incide === "TODAS" || incide === "SO_FGTS",
  incideIrrf: incide === "TODAS",
  entraNaMedia: entraNaMedia ?? false,
}));

export const PAPEIS: ReadonlySet<string> = new Set(RUBRICAS_PADRAO.map((r) => r.papel).filter((p): p is PapelDaRubrica => p !== null));

export function ehPapel(v: unknown): v is PapelDaRubrica {
  return typeof v === "string" && PAPEIS.has(v);
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
