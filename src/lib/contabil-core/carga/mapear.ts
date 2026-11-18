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
//
// Bloco B (Fase B5, 18/11/2026): as cinco tabelas da conciliação, no fim do arquivo.
// - As colunas JSON (`snapshot`, `relatorio`, `extrato_ids`, `razao_itens`, `financeiro_ids`,
//   `comparacao_ids`) são copiadas SEM conversão: o Connect guarda o JSON do original (snake_case,
//   dinheiro como o texto do `Decimal`), e os hashes gravados (`extrato_hash`, `revisao_hash`,
//   `hashes_apoio`, ids das sugestões) continuam valendo. Ver `jsonDoOriginal`.
// - Pessoa em coluna obrigatória (`criadoPorId`, `confirmadoPorId`) sem par no Connect: ver
//   `pessoaObrigatoria`.

import { createHash } from "node:crypto";
import {
  agenciaChave, codigoAtivo, contraparteChaveAtiva, decisaoSemRegra, hashAtivo, regraChaveAtiva,
  registroChaveAtiva, registroChavePadraoAtiva, revisaoChaveAtiva,
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

// ─── Bloco B: a conciliação (Fase B5) ───────────────────────────────────────

/** Prefixo da pessoa do original sem par no Connect, em coluna que não aceita nulo. */
export const PESSOA_DO_ORIGINAL = "contabil-core:";

/**
 * Pessoa em coluna obrigatória (`criado_por` da revisão e da análise, `usuario_id` dos vínculos).
 * Com par, o `User` do Connect. Sem par, a regra da Fase 5 deixaria nulo, e a coluna não aceita:
 * fica "contabil-core:<uuid do original>". É o mesmo estado de quem foi excluído do Connect (essas
 * colunas são trilha sem chave estrangeira, com tratamento "manter" em `exclusao/registro.ts`), e o
 * prefixo deixa claro que o id não é de `User`. Nada no Connect lê essas colunas para mostrar
 * nome: o vínculo grava o nome em `responsavel`. A pessoa vai para o relatório (`pessoasSemPar`).
 */
export function pessoaObrigatoria(pessoas: Pessoas, v: unknown): string {
  return pessoas.get(String(v)) ?? `${PESSOA_DO_ORIGINAL}${String(v)}`;
}

/**
 * Uma coluna `json` do original, lida como TEXTO (o leitor da carga não deixa o `pg` converter), para
 * conferir o que o `JSON.parse` perderia. O que o original guardou é o `json.dumps` do
 * `model_dump(mode="json")`: textos, inteiros, booleanos, nulos, listas e objetos — o dinheiro vai
 * como o texto do `Decimal` ("-350.00") e não há número fracionário nos esquemas do Bloco B. O único
 * valor que o `JSON.parse` mudaria é o inteiro fora de ±2^53; aí a linha é recusada, em vez de
 * gravada com outro número. Textos (inclusive os `\uXXXX` do `ensure_ascii`) voltam iguais; a ordem
 * das chaves o MySQL refaz, sem mudar valor.
 */
export function jsonDoOriginal(v: unknown): object {
  if (typeof v !== "string") throw new Error("Coluna JSON do original deve chegar como texto.");
  const grande = inteiroForaDoLimite(v);
  if (grande) throw new Error(`Inteiro fora do limite exato do JavaScript no JSON do original (${grande.slice(0, 30)}).`);
  const valor: unknown = JSON.parse(v);
  if (valor === null || typeof valor !== "object") throw new Error("Coluna JSON do original sem objeto nem lista.");
  return valor;
}

/** O primeiro número inteiro do texto JSON que o `Number` não representa exatamente, ou `null`. */
export function inteiroForaDoLimite(json: string): string | null {
  for (let i = 0; i < json.length; ) {
    const c = json[i];
    if (c === '"') {
      // Pula o texto inteiro, com os escapes.
      for (i++; i < json.length && json[i] !== '"'; i++) if (json[i] === "\\") i++;
      i++;
    } else if (c === "-" || (c >= "0" && c <= "9")) {
      let j = i;
      while (j < json.length && /[-+0-9.eE]/.test(json[j])) j++;
      const numero = json.slice(i, j);
      if (/^-?\d+$/.test(numero) && !Number.isSafeInteger(Number(numero))) return numero;
      i = j;
    } else i++;
  }
  return null;
}

/** Igualdade valor a valor de dois JSON já lidos: listas na ordem, objetos pelas chaves (em qualquer ordem). */
export function mesmoJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => mesmoJson(x, bb[i]));
  }
  const ka = Object.keys(a);
  const ob = b as Record<string, unknown>;
  return ka.length === Object.keys(ob).length && ka.every((k) => Object.hasOwn(ob, k) && mesmoJson((a as Record<string, unknown>)[k], ob[k]));
}

export function revisao(l: Linha, tenantId: string, pessoas: Pessoas) {
  const deletedAt = instante(l.deleted_at);
  const revisaoHash = String(l.revisao_hash);
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), agenciaId: String(l.agencia_id),
    criadoPorId: pessoaObrigatoria(pessoas, l.criado_por),
    nomeArquivo: String(l.nome_arquivo), titulo: texto(l.titulo), contaBancaria: String(l.conta_bancaria),
    periodoInicio: diaUtc(l.periodo_inicio)!, periodoFim: diaUtc(l.periodo_fim)!,
    revisaoHash, extratoHash: String(l.extrato_hash), versao: Number(l.versao),
    snapshot: jsonDoOriginal(l.snapshot), relatorio: jsonDoOriginal(l.relatorio),
    chaveAtiva: revisaoChaveAtiva({ revisaoHash, deletedAt }),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt,
  };
}

/** Desfazer, comum aos vínculos da revisão e do financeiro. */
const desfeito = (l: Linha) => ({
  estado: String(l.estado), responsavel: String(l.responsavel),
  desfeitoPor: texto(l.desfeito_por), desfeitoEm: instante(l.desfeito_em), motivoDesfazer: texto(l.motivo_desfazer),
});

export function vinculoDaRevisao(l: Linha, tenantId: string, pessoas: Pessoas) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), revisaoId: String(l.revisao_id),
    extratoIds: jsonDoOriginal(l.extrato_ids), razaoItens: jsonDoOriginal(l.razao_itens),
    totalExtrato: String(l.total_extrato), totalRazao: String(l.total_razao), diferenca: String(l.diferenca),
    observacao: String(l.observacao ?? ""), confirmadoPorId: pessoaObrigatoria(pessoas, l.usuario_id), ...desfeito(l),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

export function analise(l: Linha, tenantId: string, pessoas: Pessoas) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), agenciaId: String(l.agencia_id),
    criadoPorId: pessoaObrigatoria(pessoas, l.criado_por),
    titulo: String(l.titulo), contaBancaria: String(l.conta_bancaria),
    periodoInicio: diaUtc(l.periodo_inicio)!, periodoFim: diaUtc(l.periodo_fim)!,
    extratoHash: String(l.extrato_hash), versao: Number(l.versao), snapshot: jsonDoOriginal(l.snapshot),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

/**
 * O documento sem os bytes (`conteudo`), que vão para o disco. A chave (`storageKey`) vem de quem
 * grava o arquivo (`chaveDoOriginal`, do serviço do Connect), para o lugar ser o mesmo.
 */
export function documento(l: Linha, tenantId: string, storageKey: string) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), analiseId: String(l.analise_id),
    nomeArquivo: String(l.nome_arquivo), tipo: String(l.tipo), hashArquivo: String(l.hash_arquivo),
    mediaType: String(l.media_type), tamanho: Number(l.tamanho), storageKey,
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

/** SHA-256 em hexadecimal, como o `hash_arquivo` do original. */
export const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/**
 * Os bytes de `financeiro_documentos.conteudo` são os que o original registrou? O SHA-256 tem de
 * ser o `hash_arquivo` e o tamanho o `tamanho`. Devolve o motivo da recusa, ou `null`.
 */
export function conferirOriginal(conteudo: Uint8Array | null | undefined, l: Linha): string | null {
  if (!conteudo || conteudo.length === 0) return "documento sem conteúdo no original";
  if (sha256Hex(conteudo) !== String(l.hash_arquivo)) return "SHA-256 do conteúdo diferente do hash_arquivo do original";
  if (conteudo.length !== Number(l.tamanho)) return "tamanho do conteúdo diferente do registrado no original";
  return null;
}

export function vinculoDoFinanceiro(l: Linha, tenantId: string, pessoas: Pessoas) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), analiseId: String(l.analise_id),
    tipoComparacao: String(l.tipo_comparacao),
    financeiroIds: jsonDoOriginal(l.financeiro_ids), comparacaoIds: jsonDoOriginal(l.comparacao_ids),
    totalFinanceiro: String(l.total_financeiro), totalComparacao: String(l.total_comparacao), diferenca: String(l.diferenca),
    observacao: String(l.observacao ?? ""), confirmadoPorId: pessoaObrigatoria(pessoas, l.usuario_id), ...desfeito(l),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}
