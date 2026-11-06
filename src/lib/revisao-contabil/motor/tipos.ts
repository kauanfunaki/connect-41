// Formatos do motor da Revisão contábil. Os nomes dos campos são os do original (AudTool, Python): o
// resultado de uma execução é gravado como JSON e lido pela tela e pelo relatório, e o gabarito compara
// campo a campo. Dinheiro em centavos inteiros, exceto `Achado.value`, em reais (legado da interface).

export type Lado = "D" | "C";

/** Linha de balancete. */
export type ContaBalancete = {
  id: string;
  code: string;
  name: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  page: number;
  line: number;
  original: string;
  classified?: boolean;
  sheet?: string;
};

/** Rubrica de DRE ou total de balanço (`BP:...`). */
export type Rubrica = { value: number; page: number; line: number; original: string };

/** Lançamento do razão: página, linha, data ISO, lote, contrapartida, valor, D/C, saldo, encerramento, histórico. */
export type Lancamento = [
  page: number,
  line: number,
  data: string,
  lote: string,
  contrapartida: string | null,
  valor: number,
  lado: Lado | null,
  saldo: number,
  encerramento: boolean,
  historico: string,
];

export type ContaRazao = {
  id: string;
  code: string;
  name: string;
  opening: number | null;
  debit: number;
  credit: number;
  totalDebit: number | null;
  totalCredit: number | null;
  closingDebit: number;
  closingCredit: number;
  closingCount: number;
  closingDates: string[];
  entryCount: number;
  page: number;
  line: number;
  issues: string[];
  closing: number | null;
};

export type Razao = { accounts: ContaRazao[]; clearing: string[]; entryCount: number };

export type TotalFiscal = { value: number; base: number | null; tax: number | null; page: number; line: number };

export type Fiscal = {
  report: "Faturamento" | "Serviços" | "Entradas";
  total: TotalFiscal | null;
  items: number;
  itemsTotal: number;
  /** [mês AAAA-MM, valor, página, linha] */
  months: [string, number, number, number][];
  /** [CFOP, valor contábil] */
  groups: [string, number][];
};

/** [código, descrição, principal, multa, juros, total] */
export type ItemGuia = [string, string, number, number, number, number];

export type Guia = {
  type: string | null;
  number: string | null;
  cnpj: string | null;
  period: string | null;
  due: string | null;
  paid: string | null;
  reference: string | null;
  items: ItemGuia[];
  principal: number | null;
  fine: number | null;
  interest: number | null;
  total: number | null;
  page: number;
  line: number;
};

export type Fatos = {
  kind: string;
  layout?: "classified" | "unclassified" | null;
  accounts: ContaBalancete[];
  statements: Record<string, Rubrica>;
  cnpjs: string[];
  periods: string[][];
  positionDates?: string[];
  pages?: number;
  candidateLines?: number;
  characters?: number;
  warnings: string[];
  parseWarnings?: string[];
  pageTexts?: string[];
  ledger?: Razao;
  ledgerEntries?: Lancamento[];
  fiscal?: Fiscal;
  payments?: { guides: Guia[] };
};

export type Documento = {
  id?: string;
  name: string;
  companyId?: string;
  closingId?: string;
  cnpj?: string;
  period?: string[];
  sha256?: string;
  size?: number;
  extractedAt?: string;
  facts: Fatos;
};

export type Empresa = { id?: string; name?: string; cnpj?: string; sector?: string; [k: string]: unknown };
export type Fechamento = {
  id?: string;
  companyId?: string;
  start: string;
  end: string;
  regime?: string;
  framework?: string;
  purpose?: string;
  status?: string;
  [k: string]: unknown;
};

export type EstadoDoTeste = "Confere no escopo" | "Pendente" | "Divergência" | "Não executado" | "Bloqueado";
export type EstadoDaParte = "Não localizado" | "Confere no escopo" | "Pendente" | "Divergência" | "Não executado";

export type Teste = {
  id: string;
  title: string;
  status: EstadoDoTeste;
  source: string;
  difference: number | null;
  formula: string;
  reason: string;
  parts?: Record<string, EstadoDaParte>;
};

export type Achado = {
  id: string;
  title: string;
  area: string;
  severity: string;
  /** Em reais, por legado da interface. */
  value: number;
  kind: string;
  rule: string;
  source: string;
  fact: string;
  meaning: string;
  action: string;
  impact: string;
  owner: string;
  status: string;
  before: number;
  after: number;
};

export type EstadoDoItem = "Confere no escopo" | "Confere em parte" | "Pendente" | "Divergência" | "Não executado" | "Conferência manual";

export type ItemDoManual = {
  item: string;
  section: string;
  title: string;
  status: EstadoDoItem;
  refs: { id: string; title: string; status: string; parts?: { name: string; status: string }[] }[];
  note: string;
};

export type Resumo = {
  assets?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  longLiabilities?: number;
  equity?: number;
  openResult?: number;
  grossRevenue?: number;
  grossRevenueSource?: "balancete" | "razão";
  netRevenue?: number;
  result?: number;
  resultSource?: "balancete";
};

export type Analise = {
  tests: Teste[];
  findings: Achado[];
  summary: Resumo;
  conclusion: "Inconclusivo";
  documentCount: number;
  eligibleCount?: number;
  version: string;
  manual: ItemDoManual[];
  limits?: string;
};

export type RegistraTeste = (
  id: string,
  title: string,
  status: EstadoDoTeste,
  source: string,
  diff?: number | null,
  formula?: string,
  reason?: string,
  parts?: Record<string, EstadoDaParte> | null,
) => void;

export type RegistraAchado = (
  title: string,
  area: string,
  value: number | null,
  kind: string,
  source: string,
  fact: string,
  action: string,
  severity?: string,
) => void;
