// Os tipos do Razão lido (Bloco B, 11/11/2026): as dataclasses de `conciliacao_bancaria/razao.py` e
// `apoio.py`, e o dicionário que `concilpro/planilha.py` devolve.
//
// Convenções do porte:
// - `date` do Python é texto "AAAA-MM-DD"; `datetime` é o `str()` dele, "AAAA-MM-DD HH:MM:SS";
// - dinheiro é sempre `Dec` (decimal exato), nunca `number`;
// - as exceções do original são `Error` com `name` igual ao da classe Python e a mesma mensagem.

import type { Dec } from "../motor/decimal";

// ─── Exceções ───────────────────────────────────────────────────────────────

/** `RazaoInvalido`: o arquivo não é um razão de uma conta legível e conferido. */
export class RazaoInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "RazaoInvalido";
  }
}

/** `RazaoApoioInvalido(RazaoInvalido)`: o documento auxiliar não serve como evidência conferida. */
export class RazaoApoioInvalido extends RazaoInvalido {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "RazaoApoioInvalido";
  }
}

/** Uma exceção do Python que não tem classe própria aqui (`ValueError`, `OverflowError`…). */
export function erroPython(nome: string, mensagem: string): Error {
  const e = new Error(mensagem);
  e.name = nome;
  return e;
}

// ─── razao.py ───────────────────────────────────────────────────────────────

/** `LancamentoRazao` */
export type LancamentoRazao = {
  readonly data: string;
  readonly lote: string;
  readonly historico: string;
  readonly contrapartida: string;
  /** Visto do banco: débito na conta banco é entrada (+), crédito é saída (−). */
  readonly valor: Dec;
};

/** `RazaoConta`: o razão de UMA conta. */
export type RazaoConta = {
  empresa: string;
  /** Só os dígitos. */
  cnpj: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  /** Código reduzido do Mister Contador ("2699"). */
  contaCodigo: string;
  /** "1.1.1.02.0015" */
  contaClassificacao: string;
  /** "BANCO ITAÚ C/C 122870" */
  contaDescricao: string;
  lancamentos: LancamentoRazao[];
  totalDebito: Dec;
  totalCredito: Dec;
};

// ─── apoio.py ───────────────────────────────────────────────────────────────

/** `LinhaApoio`: um lançamento de outra conta, com a natureza declarada na conta de origem. */
export type LinhaApoio = {
  readonly data: string;
  readonly contaCodigo: string;
  readonly contaClassificacao: string;
  readonly contaDescricao: string;
  readonly lote: string;
  readonly contrapartida: string;
  readonly historico: string;
  readonly valorDebito: Dec;
  readonly valorCredito: Dec;
  /** Só de coluna explícita da planilha; nunca inferido do histórico. */
  readonly documento: string | null;
  readonly favorecido: string | null;
};

/** `ContaApoio` */
export type ContaApoio = {
  readonly contaCodigo: string;
  readonly contaClassificacao: string;
  readonly contaDescricao: string;
  readonly totalDebito: Dec;
  readonly totalCredito: Dec;
};

/** `RazaoApoio` */
export type RazaoApoio = {
  empresa: string;
  cnpj: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  contas: ContaApoio[];
  linhas: LinhaApoio[];
};

// ─── concilpro/planilha.py ──────────────────────────────────────────────────

export type NomeColuna = "data" | "lote" | "historico" | "cta" | "debito" | "credito" | "saldo";

/** O índice de cada coluna achada pelo rótulo (`localizar_colunas`). O apoio acrescenta outras. */
export type Colunas = Partial<Record<NomeColuna | "documento" | "favorecido", number>>;

/** `_extrair_cabecalho`: as datas são `datetime` ("AAAA-MM-DD 00:00:00"). */
export type CabecalhoRazao = {
  empresa: string;
  cnpj: string;
  periodoInicio: string | null;
  periodoFim: string | null;
};

/** Um lançamento do dicionário do ConcilPro. */
export type LancamentoPlanilha = {
  /** `datetime` da célula, com a hora que ela tiver. */
  dataLancamento: string;
  lote: string;
  historico: string;
  contaPartida: string | null;
  valorDebito: Dec;
  valorCredito: Dec;
  saldoAposLancamento: Dec;
  saldoTipo: "C" | "D" | "";
  tipoOperacao: "PAGAMENTO" | "COMPRA";
  numeroNf: string | null;
  cnpjHistorico: string | null;
  classificacaoIncerta: boolean;
  classificadoPorIa: boolean;
};

/** Um bloco "Conta:" (no ConcilPro, um fornecedor). */
export type BlocoPlanilha = {
  codigoConta: string;
  contaContabil: string;
  nomeFornecedor: string;
  saldoAnterior: Dec;
  saldoAnteriorTipo: "C" | "D" | "";
  /** O "Total da conta" declarado, ou a soma dos lançamentos quando ele não existe. */
  totalDebito: Dec;
  totalCredito: Dec;
  lancamentos: LancamentoPlanilha[];
  conciliacaoIa: never[];
  resumoIa: Record<string, never>;
  validacaoIa: Record<string, never>;
};

/** O retorno de `parsear_planilha_razao` / `parsear_xls_razao`. */
export type RazaoPlanilha = {
  hashArquivo: string;
  empresa: string;
  cnpj: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  totalFornecedores: number;
  totalLancamentos: number;
  fornecedores: BlocoPlanilha[];
};
