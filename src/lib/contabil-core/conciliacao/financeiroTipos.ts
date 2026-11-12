// A conferência do financeiro (Bloco B, Fase B4, 12/11/2026): os tipos dos leitores de documento e
// da API/tela. Porte de `financeiro_documentos.py` (LinhaFinanceiro, DocumentoFinanceiro) e de
// `src/schemas/conciliacao_financeiro.py`.
//
// Como na revisão (B3), o banco guarda o `snapshot` com as MESMAS chaves do original (snake_case),
// para a carga copiar sem conversão e as identidades/hashes continuarem valendo; estes tipos são a
// forma da API e da tela (camelCase). Datas "AAAA-MM-DD", instantes ISO 8601, dinheiro como texto na
// API e `Dec` dentro do servidor.

import type { Dec } from "../motor/decimal";

// ─── Leitores (financeiro_documentos.py) ─────────────────────────────────────

/** `LinhaFinanceiro`: um movimento lido de um documento do financeiro (valor com sinal: + entrada, − saída). */
export type LinhaFinanceiro = {
  readonly data: string;
  readonly valor: Dec;
  readonly historico: string;
  readonly favorecido: string | null;
  readonly documento: string | null;
  readonly categoria: string | null;
  readonly parcela: string | null;
  readonly banco: string | null;
  readonly referencia: string;
  readonly observacao: string | null;
  readonly documentoFavorecido: string | null;
};

/** `DocumentoFinanceiro` */
export type DocumentoFinanceiro = {
  linhas: LinhaFinanceiro[];
  banco: string | null;
  avisos: string[];
  /** Só dígitos. */
  cnpj: string | null;
  titulosAbertos: LinhaFinanceiro[];
};

// ─── API e tela (schemas/conciliacao_financeiro.py) ───────────────────────────

export type TipoDocumentoFinanceiro = "FINANCEIRO" | "SISPAG" | "RAZAO" | "EXTRATO_DETALHADO";
export type TipoFonteFinanceiro = "FINANCEIRO" | "EXTRATO" | "SISPAG" | "RAZAO" | "EXTRATO_DETALHADO";
/** RAZAO_* usam o Razão como base: `financeiroIds`/`totalFinanceiro` guardam o lado base. */
export type TipoComparacao = "EXTRATO" | "SISPAG" | "RAZAO" | "RAZAO_SISPAG" | "RAZAO_DETALHADO";
export type Sentido = "ENTRADA" | "SAIDA";

export type FonteFinanceiro = {
  id: string;
  tipo: TipoFonteFinanceiro;
  nomeArquivo: string;
  banco: string | null;
  avisos: string[];
  temOriginal: boolean;
};

export type LinhaFinanceiroJson = {
  id: string;
  ordem: number | null;
  ordemFonte: string | null;
  fonteId: string;
  tipoFonte: TipoFonteFinanceiro;
  sentido: Sentido;
  data: string;
  valor: string;
  historico: string;
  favorecido: string | null;
  documento: string | null;
  documentoFavorecido: string | null;
  categoria: string | null;
  parcela: string | null;
  banco: string | null;
  referencia: string;
  observacao: string | null;
};

export type VinculoFinanceiro = {
  id: string;
  tipoComparacao: TipoComparacao;
  financeiroIds: string[];
  comparacaoIds: string[];
  totalFinanceiro: string;
  totalComparacao: string;
  diferenca: string;
  observacao: string;
  estado: "ATIVO" | "DESFEITO";
  responsavel: string;
  criadoEm: string;
  desfeitoPor: string | null;
  desfeitoEm: string | null;
  motivoDesfazer: string | null;
};

export type ResumoAnaliseFinanceiro = {
  id: string;
  agenciaId: string;
  titulo: string;
  contaBancaria: string;
  periodoInicio: string;
  periodoFim: string;
  versao: number;
  criadaEm: string;
  atualizadaEm: string;
};

export type ListaAnalisesFinanceiro = { itens: ResumoAnaliseFinanceiro[]; total: number; pagina: number; porPagina: number };

export type AnaliseFinanceiro = ResumoAnaliseFinanceiro & {
  fontes: FonteFinanceiro[];
  linhas: LinhaFinanceiroJson[];
  titulosAbertos: LinhaFinanceiroJson[];
  vinculos: VinculoFinanceiro[];
  avisos: string[];
  /** O extrato ainda é o da criação? Se não, só as conferências com o Extrato ficam bloqueadas. */
  extratoValido: boolean;
};

/** Uma sugestão de conferência (`sugestoes_financeiro.sugerir`), só leitura até a pessoa confirmar. */
export type SugestaoFinanceiro = {
  id: string;
  financeiroIds: string[];
  comparacaoIds: string[];
  /** Os demais campos seguem o dicionário do original, em camelCase (veja `sugerir`). */
  [campo: string]: unknown;
};

/** O envelope de `sugerir`: a versão da análise em que as sugestões valem, o tipo, as sugestões e os avisos (teto de comparações). */
export type SugestoesFinanceiro = { versao: number; tipoComparacao: TipoComparacao; itens: SugestaoFinanceiro[]; avisos: string[] };

export type NovaAnaliseFinanceiro ={ agenciaId: string; periodoInicio: string; periodoFim: string; titulo: string };
export type NovoVinculoFinanceiro = { versao: number; sugestaoId: string | null; financeiroIds: string[]; comparacaoIds: string[]; observacao: string };
export type SugestoesEmLote = { versao: number; sugestoes: { sugestaoId: string; financeiroIds: string[]; comparacaoIds: string[] }[]; observacao: string };
export type DesfazerVinculoFinanceiro = { versao: number; motivo: string };
export type RenomearAnaliseFinanceiro = { versao: number; titulo: string };

/** Códigos que a tela trata de um jeito próprio (os `code` do original). */
export type CodigoErroFinanceiro =
  | "CONFIRMAR_EMPRESA"
  | "VERSAO_DESATUALIZADA"
  | "EXTRATO_ALTERADO"
  | "CONFLITO"
  | "NAO_ENCONTRADA"
  | (string & {});
