// A revisão manual da conciliação (Bloco B, Fase B3, 12/11/2026): os tipos que a tela recebe, porte
// de `src/schemas/revisao_conciliacao.py` e `gestao_conciliacao.py`.
//
// No banco, a revisão guarda o `snapshot` e o `relatorio` com as MESMAS chaves do original (snake_case,
// como o `model_dump(mode="json")` do pydantic), para a carga copiar as revisões sem conversão e o hash
// das evidências continuar valendo. Estes tipos são a forma da API e da tela (camelCase); a conversão
// fica no servidor. Datas são "AAAA-MM-DD", instantes são ISO 8601 e dinheiro é texto ("-1234.50").

import type { RelatorioConciliacaoJson } from "./relatorio";

export type TipoFonteRevisao = "RAZAO_BANCO" | "RAZAO_APOIO";
export type NaturezaRazao = "D" | "C";
export type EstadoVinculo = "ATIVO" | "DESFEITO";

export type FonteRevisao = {
  id: string;
  nomeArquivo: string;
  tipo: TipoFonteRevisao;
  cnpj: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
};

export type LinhaRazaoRevisao = {
  id: string;
  fonteId: string;
  tipoFonte: TipoFonteRevisao;
  /** "r0", "r1"… no Razão do banco (o índice do lançamento); nulo no Razão de apoio. */
  referenciaId: string | null;
  data: string;
  contaCodigo: string;
  contaClassificacao: string;
  contaDescricao: string;
  historico: string;
  lote: string;
  contrapartida: string;
  documento: string | null;
  favorecido: string | null;
  valorDebito: string;
  valorCredito: string;
};

export type LinhaExtratoRevisao = {
  transacaoId: string;
  data: string;
  /** Com sinal: entrada positiva, saída negativa. */
  valor: string;
  historico: string;
  documento: string | null;
  favorecido: string | null;
};

export type ItemVinculo = { linhaId: string; dc: NaturezaRazao };

export type VinculoRevisao = {
  id: string;
  extratoIds: string[];
  razaoItens: ItemVinculo[];
  totalExtrato: string;
  totalRazao: string;
  diferenca: string;
  observacao: string;
  estado: EstadoVinculo;
  responsavel: string;
  criadoEm: string;
  desfeitoPor: string | null;
  desfeitoEm: string | null;
  motivoDesfazer: string | null;
};

export type ResumoRevisao = {
  id: string;
  agenciaId: string;
  nomeArquivo: string;
  titulo: string | null;
  contaBancaria: string;
  periodoInicio: string;
  periodoFim: string;
  /** Versão esperada em toda alteração: outra pessoa mudou a revisão → conflito. */
  versao: number;
  criadaEm: string;
  atualizadaEm: string;
};

export type ListaRevisoes = { itens: ResumoRevisao[]; total: number; pagina: number; porPagina: number };

export type Revisao = ResumoRevisao & {
  relatorio: RelatorioConciliacaoJson;
  fontes: FonteRevisao[];
  linhasRazao: LinhaRazaoRevisao[];
  extrato: LinhaExtratoRevisao[];
  vinculos: VinculoRevisao[];
  avisos: string[];
  /** O extrato e a conta bancária ainda são os da criação? Se não, só leitura (histórico). */
  fontesValidas: boolean;
};

export type NovoVinculo = { versao: number; extratoIds: string[]; razaoItens: ItemVinculo[]; observacao: string };
export type DesfazerVinculo = { versao: number; motivo: string };
export type RenomearRevisao = { versao: number; titulo: string };

/**
 * Códigos que a tela trata de um jeito próprio (os `code` do original):
 * - CONFIRMAR_EMPRESA: o Razão não informa CNPJ; a tela pede a confirmação e reenvia com `confirmarEmpresa`;
 * - VERSAO_DESATUALIZADA: outra pessoa alterou a revisão; a tela recarrega;
 * - FONTE_ALTERADA: o extrato mudou desde a criação; a revisão vira histórico.
 */
export type CodigoErroRevisao = "CONFIRMAR_EMPRESA" | "VERSAO_DESATUALIZADA" | "FONTE_ALTERADA" | "CONFLITO" | "NAO_ENCONTRADA";
