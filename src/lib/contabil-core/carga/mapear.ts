// A carga do Contábil Core para o Connect (Fase 5, 10/11/2026): de cada linha do PostgreSQL do
// original para os dados da tabela `core_*` correspondente. Funções puras: quem lê e grava é o
// script `scripts/contabil-core/carga.ts`.
//
// - O id é o UUID do original: rodar a carga de novo atualiza a mesma linha (espelho), sem duplicar.
// - As colunas de unicidade que o PostgreSQL fazia com índice parcial são calculadas aqui, pelas
//   mesmas funções que o Connect usa ao gravar (`motor/chaves.ts`).
// - Pessoa (criado por, cancelado por…) é ligada ao `User` do Connect pelo e-mail; sem par, fica nula.
// - Datas de calendário (`date` no PostgreSQL) chegam como texto "AAAA-MM-DD" (o leitor não as
//   converte para instante, para o fuso não mudar o dia).

import {
  agenciaChave, codigoAtivo, contraparteChaveAtiva, decisaoSemRegra, hashAtivo, regraChaveAtiva,
  registroChaveAtiva, registroChavePadraoAtiva,
} from "../motor/chaves";

/** Linha crua do PostgreSQL (`pg`): números decimais vêm como texto, instantes como `Date`. */
export type Linha = Record<string, unknown>;

/** De id de pessoa do original para id de `User` do Connect (ou `null`). */
export type Pessoas = ReadonlyMap<string, string | null>;

const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));
const instante = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));
const pessoa = (pessoas: Pessoas, v: unknown) => (v ? (pessoas.get(String(v)) ?? null) : null);
/** "AAAA-MM-DD" (data de calendário) → meia-noite UTC, como o `dataDoDia` dos serviços. */
const diaUtc = (v: unknown) => (v === null || v === undefined ? null : new Date(`${String(v).slice(0, 10)}T00:00:00.000Z`));

/** Só os dígitos do CNPJ: o original e o Connect gravam com ou sem máscara. */
export const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function empresa(l: Linha, tenantId: string, companyId: string) {
  return {
    id: String(l.id), tenantId, companyId,
    cnpj: String(l.cnpj), razaoSocial: String(l.razao_social), regimeTributario: String(l.regime_tributario), ativa: Boolean(l.ativa),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

/** A conta sem o pai: a hierarquia entra numa segunda passada, quando todas as contas existem. */
export function conta(l: Linha, tenantId: string) {
  const deletedAt = instante(l.deleted_at);
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id),
    contaNumero: l.conta_numero === null || l.conta_numero === undefined ? null : Number(l.conta_numero),
    codigo: String(l.codigo), descricao: String(l.descricao), tipo: String(l.tipo), tipoSa: String(l.tipo_sa),
    aceitaLancamentos: Boolean(l.aceita_lancamentos),
    codigoAtivo: codigoAtivo({ codigo: String(l.codigo), deletedAt }),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt,
  };
}

export function faixa(l: Linha, tenantId: string) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id),
    tipo: String(l.tipo), codigoDe: String(l.codigo_de), codigoAte: String(l.codigo_ate),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

export function agencia(l: Linha, tenantId: string) {
  const a = { bancoSigla: String(l.banco_sigla), agencia: String(l.agencia), numero: String(l.numero) };
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), ...a, digito: texto(l.digito), ativa: Boolean(l.ativa),
    contaContabilId: texto(l.conta_contabil_id), chave: agenciaChave(a),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

export function contraparte(l: Linha, tenantId: string, pessoas: Pessoas) {
  const deletedAt = instante(l.deleted_at);
  const base = { ativa: Boolean(l.ativa), deletedAt, documento: String(l.documento), tipo: String(l.tipo) };
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), ...base,
    razaoSocial: String(l.razao_social), nomeFantasia: texto(l.nome_fantasia), contaContabilId: String(l.conta_contabil_id),
    origem: String(l.origem), dadosCadastrais: (l.dados_cadastrais ?? null) as object | null,
    confirmadoEm: instante(l.confirmado_em), confirmadoPorId: pessoa(pessoas, l.confirmado_por),
    chaveAtiva: contraparteChaveAtiva(base),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!,
  };
}

export function regra(l: Linha, tenantId: string) {
  const deletedAt = instante(l.deleted_at);
  const base = { ativa: Boolean(l.ativa), deletedAt, agenciaId: texto(l.agencia_id), historicoNormalizado: String(l.historico_normalizado) };
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), ...base, contaId: String(l.conta_id),
    descricao: String(l.descricao), historico: String(l.historico), dc: String(l.dc), tipo: String(l.tipo), manterHistorico: Boolean(l.manter_historico),
    chaveAtiva: regraChaveAtiva(base),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!,
  };
}

export function importacao(l: Linha, tenantId: string, pessoas: Pessoas) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), agenciaId: String(l.agencia_id),
    nomeArquivo: String(l.nome_arquivo), hashArquivo: String(l.hash_arquivo),
    totalNoArquivo: Number(l.total_no_arquivo), importadas: Number(l.importadas), duplicadas: Number(l.duplicadas), rejeitadas: Number(l.rejeitadas),
    criadoPorId: pessoa(pessoas, l.criado_por), canceladaEm: instante(l.cancelada_em), canceladaPorId: pessoa(pessoas, l.cancelada_por),
    motivoCancelamento: texto(l.motivo_cancelamento), saldoDeclarado: texto(l.saldo_declarado), dataSaldoDeclarado: diaUtc(l.data_saldo_declarado),
    alertaSaldo: texto(l.alerta_saldo),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

export function transacao(l: Linha, tenantId: string, pessoas: Pessoas) {
  const deletedAt = instante(l.deleted_at);
  const hashDedup = String(l.hash_dedup);
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), agenciaId: String(l.agencia_id),
    data: diaUtc(l.data)!, valor: String(l.valor), saldoApos: texto(l.saldo_apos), historico: String(l.historico),
    ordem: l.ordem === null || l.ordem === undefined ? null : Number(l.ordem), importacaoId: texto(l.importacao_id),
    dc: String(l.dc), status: String(l.status), hashDedup, hashAtivo: hashAtivo({ hashDedup, deletedAt }),
    autoRecusadoEm: instante(l.auto_recusado_em), autoRecusadoPorId: pessoa(pessoas, l.auto_recusado_por),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt,
  };
}

export function decisao(l: Linha, tenantId: string) {
  const d = { resultado: String(l.resultado), transacaoId: String(l.transacao_id) };
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), ...d,
    regraId: texto(l.regra_id), contaId: texto(l.conta_id), contraparteId: texto(l.contraparte_id), contaContraparteId: texto(l.conta_contraparte_id),
    origemEvidencia: texto(l.origem_evidencia), contaDivergente: l.conta_divergente === null || l.conta_divergente === undefined ? null : Boolean(l.conta_divergente),
    estrategia: texto(l.estrategia), motivo: texto(l.motivo), processadoEm: instante(l.processado_em)!,
    transacaoSemRegra: decisaoSemRegra(d),
  };
}

export function registro(l: Linha, tenantId: string, pessoas: Pessoas) {
  const deletedAt = instante(l.deleted_at);
  const perna = {
    deletedAt, transacaoId: texto(l.transacao_id), lancamentoId: String(l.lancamento_id), dc: String(l.dc) as "D" | "C",
    ordemComposicao: l.ordem_composicao === null || l.ordem_composicao === undefined ? null : Number(l.ordem_composicao),
  };
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), ...perna, contaId: String(l.conta_id), agenciaId: String(l.agencia_id),
    descricao: String(l.descricao), historico: String(l.historico), historicoExtrato: String(l.historico_extrato), tipoRegra: String(l.tipo_regra),
    valor: String(l.valor), dataLancamento: instante(l.data_lancamento)!,
    canceladoEm: instante(l.cancelado_em), canceladoPorId: pessoa(pessoas, l.cancelado_por), motivoCancelamento: texto(l.motivo_cancelamento),
    chaveAtiva: registroChaveAtiva(perna), chavePadraoAtiva: registroChavePadraoAtiva(perna),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!,
  };
}

export function exportacao(l: Linha, tenantId: string, pessoas: Pessoas) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), formato: String(l.formato), status: String(l.status),
    filtroDe: instante(l.filtro_de), filtroAte: instante(l.filtro_ate),
    totalRegistros: l.total_registros === null || l.total_registros === undefined ? null : Number(l.total_registros),
    arquivoPath: texto(l.arquivo_path), erroMsg: texto(l.erro_msg), criadoPorId: pessoa(pessoas, l.criado_por),
    createdAt: instante(l.created_at)!, finishedAt: instante(l.finished_at),
  };
}
