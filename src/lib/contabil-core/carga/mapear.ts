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

// ─── Bloco C: os documentos (Fase C4) ───────────────────────────────────────
//
// Notas, comprovantes, cartões, faturas, gastos, documentos e distribuições da fatura. Nenhuma das
// sete tabelas tem coluna de pessoa nem `chaveAtiva`: as unicidades do original são totais e
// continuam como índices únicos comuns. O `dedup_key` e a procedência (`origem`) da nota, os ids
// (inclusive os `uuid5` das compras importadas) e o JSON (`resultado`, `distribuicoes`, `aplicacao`
// com o hash) vêm como estão. Os arquivos vão para o disco (ver `arquivoDoComprovante`).

const inteiroOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function notaFiscal(l: Linha, tenantId: string) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id),
    tipo: String(l.tipo), numero: String(l.numero), serie: texto(l.serie),
    cnpjEmitente: String(l.cnpj_emitente), nomeEmitente: texto(l.nome_emitente), cnpjDestinatario: texto(l.cnpj_destinatario),
    valor: String(l.valor), dataEmissao: instante(l.data_emissao)!, status: String(l.status), transacaoId: texto(l.transacao_id),
    chaveAcesso: texto(l.chave_acesso), assinaturaMotivo: texto(l.assinatura_motivo), dedupKey: String(l.dedup_key),
    observacao: texto(l.observacao), origem: String(l.origem),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

/** O arquivo do comprovante já em disco: o SHA-256 e o tamanho dos bytes, o tipo de mídia e a chave. */
export type ArquivoNoDisco = { sha256: string; tamanho: number; tipo: string; storageKey: string };

/**
 * O comprovante sem o `arquivo_base64`, que vai para o disco. Sem arquivo (nunca teve, ou o base64 é
 * inválido), as quatro colunas do arquivo ficam nulas e o `arquivo_sha256` vem como está.
 */
export function comprovante(l: Linha, tenantId: string, arquivo: ArquivoNoDisco | null) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), agenciaId: texto(l.agencia_id), transacaoId: texto(l.transacao_id),
    favorecido: texto(l.favorecido), cpfCnpj: texto(l.cpf_cnpj),
    dataPagamento: instante(l.data_pagamento), dataVencimento: instante(l.data_vencimento),
    valorDocumento: texto(l.valor_documento), valorPago: String(l.valor_pago),
    juros: String(l.juros), multa: String(l.multa), desconto: String(l.desconto),
    observacao: texto(l.observacao), arquivoNome: texto(l.arquivo_nome),
    arquivoSha256: arquivo ? arquivo.sha256 : texto(l.arquivo_sha256),
    arquivoTipo: arquivo?.tipo ?? null, arquivoTamanho: arquivo?.tamanho ?? null, storageKey: arquivo?.storageKey ?? null,
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

const ALFABETO_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * `base64.b64decode(texto)` do Python (sem `validate`), que o original usava para o hash do comprovante:
 * os caracteres fora do alfabeto são ignorados, o "=" fecha o bloco e o bloco incompleto é erro. Devolve
 * os bytes, ou `null` onde o Python levantaria `binascii.Error` ou `ValueError` (o texto com caractere
 * fora do ASCII). O `Buffer.from(…, "base64")` do Node aceita mais do que isso, por isso a conta própria.
 */
export function base64DoPython(texto: string): Uint8Array | null {
  const saida: number[] = [];
  let posicao = 0;
  let resto = 0;
  let enchimentos = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c > 127) return null;
    if (c === 61) {
      // "=": a partir do terceiro caractere do bloco, fecha o bloco e encerra a leitura.
      if (posicao >= 2 && posicao + ++enchimentos >= 4) return Uint8Array.from(saida);
      continue;
    }
    const v = ALFABETO_BASE64.indexOf(texto[i]);
    if (v < 0) continue;
    enchimentos = 0;
    if (posicao === 0) {
      resto = v;
      posicao = 1;
    } else if (posicao === 1) {
      saida.push(((resto << 2) | (v >> 4)) & 0xff);
      resto = v & 0x0f;
      posicao = 2;
    } else if (posicao === 2) {
      saida.push(((resto << 4) | (v >> 2)) & 0xff);
      resto = v & 0x03;
      posicao = 3;
    } else {
      saida.push(((resto << 6) | v) & 0xff);
      posicao = 0;
    }
  }
  return posicao === 0 ? Uint8Array.from(saida) : null;
}

/** O que fazer com o arquivo de um comprovante do original. */
export type ArquivoDoOriginal =
  | { tipo: "sem_arquivo" }
  /** O base64 que o Python não decodifica: lá ficou sem hash (o `_hash_do_base64` devolvia `None`), aqui entra sem arquivo. */
  | { tipo: "base64_invalido" }
  | { tipo: "recusa"; motivo: string }
  /** `calculado`: o original não tinha o `arquivo_sha256` (linhas de antes da migration 0037); vai para o relatório. */
  | { tipo: "arquivo"; bytes: Uint8Array; sha256: string; calculado: boolean };

/**
 * Os bytes do `arquivo_base64` do comprovante, decodificados como o original (`_hash_do_base64`), e o
 * SHA-256 conferido contra o `arquivo_sha256` gravado lá. O hash diferente recusa a linha, como o
 * original do financeiro na B5; o hash ausente é calculado aqui.
 */
export function arquivoDoComprovante(l: Linha): ArquivoDoOriginal {
  const base64 = l.arquivo_base64;
  const gravado = texto(l.arquivo_sha256);
  if (base64 === null || base64 === undefined || base64 === "") return { tipo: "sem_arquivo" };
  const bytes = base64DoPython(String(base64));
  if (!bytes) {
    return gravado ? { tipo: "recusa", motivo: "base64 do arquivo inválido, mas com arquivo_sha256 no original" } : { tipo: "base64_invalido" };
  }
  const sha256 = sha256Hex(bytes);
  if (gravado && gravado !== sha256) return { tipo: "recusa", motivo: "SHA-256 do arquivo diferente do arquivo_sha256 do original" };
  return { tipo: "arquivo", bytes, sha256, calculado: !gravado };
}

export function cartao(l: Linha, tenantId: string) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id),
    nome: String(l.nome), bandeira: String(l.bandeira), ultimosDigitos: texto(l.ultimos_digitos),
    diaFechamento: Number(l.dia_fechamento), diaVencimento: Number(l.dia_vencimento), limite: texto(l.limite), ativo: Boolean(l.ativo),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

export function fatura(l: Linha, tenantId: string) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), cartaoId: String(l.cartao_id), competencia: String(l.competencia),
    dataFechamento: instante(l.data_fechamento), dataVencimento: instante(l.data_vencimento),
    valorTotal: String(l.valor_total), status: String(l.status), transacaoId: texto(l.transacao_id), observacao: texto(l.observacao),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

export function lancamentoCartao(l: Linha, tenantId: string) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), faturaId: String(l.fatura_id),
    dataCompra: instante(l.data_compra)!, descricao: String(l.descricao), valor: String(l.valor), contaId: texto(l.conta_id),
    parcelaAtual: inteiroOuNulo(l.parcela_atual), parcelaTotal: inteiroOuNulo(l.parcela_total),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

/**
 * O documento da fatura sem os bytes (`conteudo`), que vão para o disco. A chave e o tamanho vêm de quem
 * grava o arquivo (`chaveDoArquivo` de `originaisFaturas.ts`).
 */
export function faturaDocumento(l: Linha, tenantId: string, arquivo: { storageKey: string; tamanho: number }) {
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), faturaId: String(l.fatura_id),
    nome: String(l.nome), hashArquivo: String(l.hash_arquivo), tamanho: arquivo.tamanho, storageKey: arquivo.storageKey,
    status: String(l.status), resultado: jsonDoOriginal(l.resultado), erro: texto(l.erro),
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

/** `aplicacao` é nula enquanto a distribuição não está aplicada (`none_as_null` no original). */
export function faturaDistribuicao(l: Linha, tenantId: string) {
  const aplicacao = l.aplicacao === null || l.aplicacao === undefined || String(l.aplicacao).trim() === "null" ? null : jsonDoOriginal(l.aplicacao);
  return {
    id: String(l.id), tenantId, empresaId: String(l.empresa_id), faturaId: String(l.fatura_id),
    versao: Number(l.versao), distribuicoes: jsonDoOriginal(l.distribuicoes), aplicacao,
    createdAt: instante(l.created_at)!, updatedAt: instante(l.updated_at)!, deletedAt: instante(l.deleted_at),
  };
}

/**
 * Os bytes de `fatura_documentos.conteudo` são os que o original registrou? O SHA-256 tem de ser o
 * `hash_arquivo` (o original não guardava o tamanho: ele vem dos bytes). Devolve o motivo da recusa, ou `null`.
 */
export function conferirPdfDaFatura(conteudo: Uint8Array | null | undefined, l: Linha): string | null {
  if (!conteudo || conteudo.length === 0) return "documento sem conteúdo no original";
  if (sha256Hex(conteudo) !== String(l.hash_arquivo)) return "SHA-256 do conteúdo diferente do hash_arquivo do original";
  return null;
}

/** As linhas do Bloco C de uma empresa, como o original as guarda (sem os arquivos). */
export type LinhasDoBlocoC = {
  notas: Linha[];
  comprovantes: Linha[];
  cartoes: Linha[];
  faturas: Linha[];
  lancamentos: Linha[];
  documentos: Linha[];
  distribuicoes: Linha[];
};

const BANDEIRAS = ["visa", "mastercard", "elo", "amex", "hipercard", "outros"];
const NO_MYSQL = { inicio: Date.UTC(1000, 0, 1), fim: Date.UTC(10000, 0, 1) };

/** Alguma das colunas de instante fora do que o `DATETIME` do MySQL guarda (anos 1000 a 9999)? */
function dataForaDoMysql(l: Linha, colunas: string[]): string | null {
  for (const c of [...colunas, "created_at", "updated_at", "deleted_at"]) {
    const v = instante(l[c]);
    if (v && !(v.getTime() >= NO_MYSQL.inicio && v.getTime() < NO_MYSQL.fim)) return `${c} fora do que o MySQL guarda (anos 1000 a 9999)`;
  }
  return null;
}

const negativo = (v: unknown) => Number(v) < 0;

/**
 * As linhas que as travas do Connect recusariam, decididas ANTES de gravar, para a carga não parar no
 * meio: os CHECKs das migrations do Bloco C (valor pago maior que zero e acréscimos não negativos da C2;
 * bandeira, dias de 1 a 28, status, gasto não negativo e versão não negativa da C3), as unicidades sob a
 * comparação do MySQL (que não diferencia maiúscula, ao contrário do PostgreSQL) e as datas fora do
 * `DATETIME`. Quem depende de uma linha pulada cai junto (a fatura do cartão pulado, os gastos, os
 * documentos e a distribuição da fatura pulada), com o motivo. Nada é corrigido: o id e o motivo vão para
 * o relatório, como as recusas da B5. A primeira linha (pela criação) fica; as repetidas, não.
 *
 * Os enums (tipo, status e origem da nota, status da fatura) já são enums no PostgreSQL e não chegam
 * fora da lista; a conferência fica por garantia.
 */
export function puladasPelasTravas(b: LinhasDoBlocoC): Map<string, string> {
  const puladas = new Map<string, string>();
  /** Mais de uma trava na mesma linha: todos os motivos, separados por "; ". */
  const pular = (l: Linha, motivo: string | null) => {
    if (!motivo) return;
    const antes = puladas.get(String(l.id));
    puladas.set(String(l.id), antes ? `${antes}; ${motivo}` : motivo);
  };
  /** Unicidade como o índice do MySQL a compara: a mesma chave, sem diferenciar maiúscula. */
  const unicas = (linhas: Linha[], nome: string, chave: (l: Linha) => (unknown)[]) => {
    const vistas = new Set<string>();
    for (const l of linhas) {
      if (puladas.has(String(l.id))) continue;
      const partes = chave(l);
      if (partes.some((p) => p === null || p === undefined)) continue;
      const k = JSON.stringify(partes.map((p) => String(p).toLowerCase()));
      if (vistas.has(k)) pular(l, `repete a unicidade ${nome} de outra linha (o MySQL não diferencia maiúscula)`);
      else vistas.add(k);
    }
  };

  for (const l of b.notas) {
    pular(l, ["nfe", "nfse"].includes(String(l.tipo)) ? null : "tipo da nota fora da lista (ck_core_nota_tipo)");
    pular(l, ["pendente", "associada", "cancelada"].includes(String(l.status)) ? null : "status da nota fora da lista (ck_core_nota_status)");
    pular(l, ["xml_assinado", "xml_nao_verificado", "ocr"].includes(String(l.origem)) ? null : "procedência fora da lista (ck_core_nota_origem)");
    pular(l, dataForaDoMysql(l, ["data_emissao"]));
  }
  unicas(b.notas, "(empresa, chave de acesso)", (l) => [l.empresa_id, l.chave_acesso]);
  unicas(b.notas, "(empresa, dedup_key)", (l) => [l.empresa_id, l.dedup_key]);

  for (const l of b.comprovantes) {
    pular(l, Number(l.valor_pago) > 0 ? null : "valor pago precisa ser maior que zero (ck_core_comprovante_valor_pago)");
    pular(l, negativo(l.juros) || negativo(l.multa) || negativo(l.desconto) ? "juros, multa e desconto não podem ser negativos (ck_core_comprovante_acrescimos)" : null);
    pular(l, dataForaDoMysql(l, ["data_pagamento", "data_vencimento"]));
  }

  for (const l of b.cartoes) {
    pular(l, BANDEIRAS.includes(String(l.bandeira)) ? null : "bandeira fora da lista (ck_core_cartao_bandeira)");
    const dia = (v: unknown) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 28;
    pular(l, dia(l.dia_fechamento) && dia(l.dia_vencimento) ? null : "dia de fechamento ou de vencimento fora de 1 a 28 (ck_core_cartao_dias)");
    pular(l, dataForaDoMysql(l, []));
  }

  for (const l of b.faturas) {
    if (puladas.has(String(l.cartao_id))) pular(l, `o cartão ${String(l.cartao_id)} ficou de fora`);
    pular(l, ["aberta", "fechada", "paga"].includes(String(l.status)) ? null : "status da fatura fora da lista (ck_core_fatura_status)");
    pular(l, dataForaDoMysql(l, ["data_fechamento", "data_vencimento"]));
  }
  unicas(b.faturas, "(cartão, competência)", (l) => [l.cartao_id, l.competencia]);
  unicas(b.faturas, "da transação que pagou a fatura", (l) => [l.transacao_id]);

  const daFatura = (l: Linha) => (puladas.has(String(l.fatura_id)) ? `a fatura ${String(l.fatura_id)} ficou de fora` : null);
  for (const l of b.lancamentos) {
    pular(l, daFatura(l));
    pular(l, negativo(l.valor) ? "gasto com valor negativo (ck_core_lancamento_cartao_valor)" : null);
    pular(l, dataForaDoMysql(l, ["data_compra"]));
  }
  for (const l of b.documentos) {
    pular(l, daFatura(l));
    pular(l, ["processando", "revisar", "falhou", "principal", "complementar"].includes(String(l.status)) ? null : "status do documento fora da lista (ck_core_fatura_documento_status)");
    pular(l, dataForaDoMysql(l, []));
  }
  unicas(b.documentos, "(fatura, hash do arquivo)", (l) => [l.fatura_id, l.hash_arquivo]);
  for (const l of b.distribuicoes) {
    pular(l, daFatura(l));
    pular(l, Number(l.versao) >= 0 ? null : "versão negativa (ck_core_fatura_distribuicao_versao)");
    pular(l, dataForaDoMysql(l, []));
  }
  unicas(b.distribuicoes, "da distribuição por fatura", (l) => [l.fatura_id]);
  return puladas;
}
