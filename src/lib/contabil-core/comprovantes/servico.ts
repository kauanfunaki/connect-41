// Comprovantes de pagamento (Bloco C, Fase C2, 19/11/2026): as partes puras de `ComprovanteService`
// (`src/domain/comprovantes/service.py`) e da validação `ComprovanteCreate` (`src/schemas/comprovantes.py`),
// sem banco.
//
// - O mesmo arquivo é sempre o mesmo comprovante: o SHA-256 dos BYTES (no original, do base64 decodificado)
//   de um comprovante vivo da empresa barra o reenvio, sem confirmação que libere
//   (`COMPROVANTE_JA_IMPORTADO`). O excluído não conta: excluir é como se corrige uma importação errada.
// - O mesmo pagamento com outro arquivo (mesmo valor, mesmo dia e o mesmo documento, ou o mesmo nome quando
//   falta documento) pede confirmação (`COMPROVANTE_POSSIVEL_DUPLICADO`): pode ser o comprovante baixado de
//   novo do app do banco, ou um segundo pagamento de verdade.
// - As recusas têm as frases do original. As do pydantic, que o original devolvia em inglês, viram frases
//   em português.
// - Quem grava, lê o banco e guarda o arquivo é `servidor/comprovantes.ts`.

import { len, strip } from "@/lib/revisao-contabil/motor/py";
import { compara, dec, decimal, ehZero, fixo, NAO_FINITO, reescala, type Dec } from "../motor/decimal";
import { casefold } from "../motor/unicodePy";
import { emissaoDaNota, somenteDigitos } from "../notas/servico";

// ─── Frases e códigos do original ───────────────────────────────────────────

export const COMPROVANTE_NAO_ENCONTRADO = "Comprovante não encontrado.";
export const AGENCIA_NAO_ENCONTRADA = "Agência bancária não encontrada nesta empresa.";
export const TRANSACAO_NAO_ENCONTRADA = "Transação não encontrada nesta empresa.";
export const JA_ASSOCIADO = "Este comprovante já está associado a uma transação. Desassocie primeiro.";
export const NAO_ASSOCIADO = "Comprovante não está associado a nenhuma transação.";
export const SEM_ARQUIVO = "Este comprovante não possui arquivo anexado.";

/** Os códigos que a tela usa para decidir o que fazer: o arquivo repetido é pulado, o possível duplicado pede confirmação. */
export const CODIGO_JA_IMPORTADO = "COMPROVANTE_JA_IMPORTADO";
export const CODIGO_POSSIVEL_DUPLICADO = "COMPROVANTE_POSSIVEL_DUPLICADO";

/** Recusa do serviço. `codigo` decide o status da rota (404, 409 ou 422, como o original). */
export type CodigoErroComprovante = "NAO_ENCONTRADA" | "CONFLITO" | "INVALIDA" | typeof CODIGO_JA_IMPORTADO | typeof CODIGO_POSSIVEL_DUPLICADO | "DOCUMENTO_NAO_E_COMPROVANTE";
export type RecusaComprovante = { ok: false; erro: string; codigo: CodigoErroComprovante; detalhes?: ResumoDoComprovante };
export type ResultadoComprovante<T> = { ok: true; valor: T } | RecusaComprovante;

const recusa = (erro: string, codigo: CodigoErroComprovante, detalhes?: ResumoDoComprovante): RecusaComprovante => ({
  ok: false,
  erro,
  codigo,
  ...(detalhes ? { detalhes } : {}),
});

// ─── Validação (`ComprovanteCreate`) ────────────────────────────────────────

/** O que chega para criar o comprovante (o corpo, em camelCase ou com os nomes do original). */
export type CamposDoComprovante = {
  favorecido?: unknown;
  cpfCnpj?: unknown;
  dataPagamento?: unknown;
  dataVencimento?: unknown;
  valorDocumento?: unknown;
  valorPago?: unknown;
  juros?: unknown;
  multa?: unknown;
  desconto?: unknown;
  observacao?: unknown;
  agenciaId?: unknown;
  transacaoId?: unknown;
  arquivoNome?: unknown;
  permitirDuplicado?: unknown;
};

/** O comprovante validado como o `ComprovanteCreate` o deixa. */
export type ComprovanteValidado = {
  favorecido: string | null;
  cpfCnpj: string | null;
  dataPagamento: Date | null;
  dataVencimento: Date | null;
  valorDocumento: Dec | null;
  valorPago: Dec;
  juros: Dec;
  multa: Dec;
  desconto: Dec;
  observacao: string | null;
  agenciaId: string | null;
  transacaoId: string | null;
  arquivoNome: string | null;
  permitirDuplicado: boolean;
};

type Validacao<T> = { ok: true; valor: T } | { ok: false; erro: string };

const ZERO = dec("0.00");
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function textoOpcional(v: unknown, campo: string): Validacao<string | null> {
  if (v === null || v === undefined) return { ok: true, valor: null };
  if (typeof v !== "string") return { ok: false, erro: `${campo} deve ser texto.` };
  return { ok: true, valor: v };
}

/** `Decimal` do pydantic: número finito do JSON ou texto que o `Decimal` lê. */
export function decimalDoCampo(v: unknown, campo: string): Validacao<Dec> {
  let d: Dec | typeof NAO_FINITO | null = null;
  if (typeof v === "object" && v !== null && "coeficiente" in v) d = v as Dec;
  else if (typeof v === "number") d = Number.isFinite(v) ? decimal(String(v)) : NAO_FINITO;
  else if (typeof v === "string") d = decimal(v);
  if (d === null) return { ok: false, erro: `${campo} não é um número.` };
  if (d === NAO_FINITO) return { ok: false, erro: `${campo} tem de ser um número finito.` };
  return { ok: true, valor: d };
}

/** `datetime | None` do pydantic: texto ISO 8601 (sem fuso vale UTC, como o banco do original o lia) ou segundos Unix. */
export function dataDoCampo(v: unknown, campo: string): Validacao<Date | null> {
  if (v === null || v === undefined) return { ok: true, valor: null };
  if (typeof v === "number" && Number.isFinite(v)) {
    // O pydantic lê número como segundos desde 1970 (ou milissegundos, acima de 2×10¹⁰).
    const ms = Math.abs(v) > 2e10 ? v : v * 1000;
    const d = new Date(Math.round(ms));
    if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1000 && d.getUTCFullYear() <= 9999) return { ok: true, valor: d };
  }
  if (typeof v === "string") {
    const e = emissaoDaNota(v);
    if (e) return { ok: true, valor: e.utc };
  }
  return { ok: false, erro: `${campo} inválida.` };
}

/** Decimal(15,2): até 13 dígitos inteiros depois de arredondar para os centavos. */
const passaDoBanco = (d: Dec) => compara(reescala(d, -2), dec("9999999999999.99")) > 0 || compara(reescala(d, -2), dec("-9999999999999.99")) < 0;

/**
 * `ComprovanteCreate`: os tipos e as restrições, na ordem dos campos (a primeira recusa é a que volta).
 * Depois, o que o banco não guarda (texto mais longo que a coluna, valor acima de `Decimal(15,2)`), que no
 * original virava erro 500 na gravação.
 */
export function validarComprovante(c: CamposDoComprovante): Validacao<ComprovanteValidado> {
  const favorecido = textoOpcional(c.favorecido, "O favorecido");
  if (!favorecido.ok) return favorecido;
  const cpfCnpj = textoOpcional(c.cpfCnpj, "O CPF/CNPJ");
  if (!cpfCnpj.ok) return cpfCnpj;
  const pagamento = dataDoCampo(c.dataPagamento, "Data de pagamento");
  if (!pagamento.ok) return pagamento;
  const vencimento = dataDoCampo(c.dataVencimento, "Data de vencimento");
  if (!vencimento.ok) return vencimento;
  let valorDocumento: Dec | null = null;
  if (c.valorDocumento !== null && c.valorDocumento !== undefined) {
    const v = decimalDoCampo(c.valorDocumento, "O valor do documento");
    if (!v.ok) return v;
    valorDocumento = v.valor;
  }
  if (c.valorPago === null || c.valorPago === undefined) return { ok: false, erro: "Informe o valor pago." };
  const valorPago = decimalDoCampo(c.valorPago, "O valor pago");
  if (!valorPago.ok) return valorPago;
  if (ehZero(valorPago.valor) || valorPago.valor.negativo) return { ok: false, erro: "O valor pago deve ser maior que zero." };
  const acrescimos: Record<"juros" | "multa" | "desconto", Dec> = { juros: ZERO, multa: ZERO, desconto: ZERO };
  for (const [campo, nome] of [
    ["juros", "Os juros"],
    ["multa", "A multa"],
    ["desconto", "O desconto"],
  ] as const) {
    const bruto = c[campo];
    if (bruto === undefined) continue;
    if (bruto === null) return { ok: false, erro: `${nome} não é um número.` };
    const v = decimalDoCampo(bruto, nome);
    if (!v.ok) return v;
    if (!ehZero(v.valor) && v.valor.negativo) return { ok: false, erro: `${nome} não pode ser negativo.` };
    acrescimos[campo] = v.valor;
  }
  const observacao = textoOpcional(c.observacao, "A observação");
  if (!observacao.ok) return observacao;
  const ids: Record<"agenciaId" | "transacaoId", string | null> = { agenciaId: null, transacaoId: null };
  for (const campo of ["agenciaId", "transacaoId"] as const) {
    const v = c[campo];
    if (v === null || v === undefined) continue;
    if (typeof v !== "string" || !UUID.test(strip(v))) return { ok: false, erro: campo === "agenciaId" ? "Conta bancária inválida." : "Transação inválida." };
    const h = strip(v).replace(/-/g, "").toLowerCase();
    ids[campo] = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const arquivoNome = textoOpcional(c.arquivoNome, "O nome do arquivo");
  if (!arquivoNome.ok) return arquivoNome;
  if (c.permitirDuplicado !== undefined && c.permitirDuplicado !== null && typeof c.permitirDuplicado !== "boolean") {
    return { ok: false, erro: "permitir_duplicado deve ser verdadeiro ou falso." };
  }

  // O que a coluna não guarda (no original, erro 500 do PostgreSQL ao gravar).
  if (favorecido.valor !== null && len(favorecido.valor) > 300) return { ok: false, erro: "O favorecido passa de 300 caracteres." };
  if (cpfCnpj.valor !== null && len(cpfCnpj.valor) > 18) return { ok: false, erro: "O CPF/CNPJ passa de 18 caracteres." };
  if (observacao.valor !== null && len(observacao.valor) > 500) return { ok: false, erro: "A observação passa de 500 caracteres." };
  if (arquivoNome.valor !== null && len(arquivoNome.valor) > 255) return { ok: false, erro: "O nome do arquivo passa de 255 caracteres." };
  for (const v of [valorDocumento, valorPago.valor, acrescimos.juros, acrescimos.multa, acrescimos.desconto]) {
    if (v !== null && passaDoBanco(v)) return { ok: false, erro: "O valor passa do limite aceito." };
  }

  return {
    ok: true,
    valor: {
      favorecido: favorecido.valor,
      cpfCnpj: cpfCnpj.valor,
      dataPagamento: pagamento.valor,
      dataVencimento: vencimento.valor,
      valorDocumento,
      valorPago: valorPago.valor,
      juros: acrescimos.juros,
      multa: acrescimos.multa,
      desconto: acrescimos.desconto,
      observacao: observacao.valor,
      agenciaId: ids.agenciaId,
      transacaoId: ids.transacaoId,
      arquivoNome: arquivoNome.valor,
      permitirDuplicado: c.permitirDuplicado === true,
    },
  };
}

// ─── O comprovante já gravado ───────────────────────────────────────────────

/** O que as conferências leem de um comprovante gravado (vivo, desta empresa). */
export type ComprovanteGravado = {
  id: string;
  favorecido: string | null;
  cpfCnpj: string | null;
  /** O dinheiro como o banco devolve, com as 2 casas. */
  valorPago: Dec;
  dataPagamento: Date | null;
  arquivoNome: string | null;
  arquivoSha256: string | null;
  transacaoId: string | null;
  criadoEm: Date;
};

/** `_so_digitos`: os dígitos de qualquer escrita (`\D` do Python). */
export const soDigitos = (t: string | null | undefined): string => somenteDigitos(t);

const ESPACOS = new RegExp("[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+", "gu");

/** `_nome_normalizado`: espaços colapsados, aparado e `casefold()`. */
export const nomeNormalizado = (t: string | null | undefined): string => casefold(strip((t ?? "").replace(ESPACOS, " ")));

/** `_brl`: "R$ 1.234,56" (o `f"{valor:,.2f}"` do Python, meio para par). */
export function brl(valor: Dec): string {
  const [inteiro, centavos] = fixo(reescala(valor, -2)).split(".");
  const negativo = inteiro.startsWith("-");
  const digitos = negativo ? inteiro.slice(1) : inteiro;
  const milhar = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${negativo ? "-" : ""}${milhar},${centavos ?? "00"}`;
}

const d2 = (n: number) => String(n).padStart(2, "0");

/** `isoformat()` de um instante do banco (`timestamptz` em UTC). */
export function isoUtc(d: Date): string {
  const ms = d.getUTCMilliseconds();
  return (
    `${String(d.getUTCFullYear()).padStart(4, "0")}-${d2(d.getUTCMonth() + 1)}-${d2(d.getUTCDate())}` +
    `T${d2(d.getUTCHours())}:${d2(d.getUTCMinutes())}:${d2(d.getUTCSeconds())}${ms ? `.${String(ms * 1000).padStart(6, "0")}` : ""}+00:00`
  );
}

/** `_descrever`: o que o contador precisa ler para reconhecer o registro que já existe. */
export function descrever(c: Pick<ComprovanteGravado, "valorPago" | "favorecido" | "dataPagamento" | "arquivoNome">): string {
  const partes = [`comprovante de ${brl(c.valorPago)}`];
  if (c.favorecido) partes.push(`para ${c.favorecido}`);
  if (c.dataPagamento) partes.push(`pago em ${d2(c.dataPagamento.getUTCDate())}/${d2(c.dataPagamento.getUTCMonth() + 1)}/${String(c.dataPagamento.getUTCFullYear()).padStart(4, "0")}`);
  let descricao = partes.join(" ");
  if (c.arquivoNome) descricao += ` (arquivo ${c.arquivoNome})`;
  return descricao;
}

/** `_resumo`: os detalhes da recusa, com as chaves do original. */
export type ResumoDoComprovante = {
  comprovante_id: string;
  favorecido: string | null;
  valor_pago: string;
  data_pagamento: string | null;
  arquivo_nome: string | null;
  associado: boolean;
};

export function resumo(c: ComprovanteGravado): ResumoDoComprovante {
  return {
    comprovante_id: c.id,
    favorecido: c.favorecido,
    valor_pago: fixo(c.valorPago, 2),
    data_pagamento: c.dataPagamento ? isoUtc(c.dataPagamento) : null,
    arquivo_nome: c.arquivoNome,
    associado: c.transacaoId !== null,
  };
}

/** `erro_ja_importado` */
export const erroJaImportado = (existente: ComprovanteGravado): RecusaComprovante =>
  recusa(`Este arquivo já foi importado: ${descrever(existente)}.`, CODIGO_JA_IMPORTADO, resumo(existente));

/** A recusa do possível duplicado (o `ConflictError` de `criar`). */
export const erroPossivelDuplicado = (parecido: ComprovanteGravado): RecusaComprovante =>
  recusa(
    `Já existe um ${descrever(parecido)}. Se forem dois pagamentos diferentes, confirme para salvar mesmo assim.`,
    CODIGO_POSSIVEL_DUPLICADO,
    resumo(parecido),
  );

const porCriacao = (a: ComprovanteGravado, b: ComprovanteGravado) => a.criadoEm.getTime() - b.criadoEm.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** `buscar_por_arquivo`: o comprovante vivo mais antigo com exatamente o mesmo arquivo. */
export function porArquivo(existentes: readonly ComprovanteGravado[], sha256: string): ComprovanteGravado | null {
  return [...existentes].filter((c) => c.arquivoSha256 === sha256).sort(porCriacao)[0] ?? null;
}

/** O dia (UTC) do pagamento: `[início, fim)` da busca do mesmo pagamento. */
export function diaDoPagamento(pagamento: Date): { inicio: Date; fim: Date } {
  const inicio = new Date(Date.UTC(pagamento.getUTCFullYear(), pagamento.getUTCMonth(), pagamento.getUTCDate()));
  if (pagamento.getUTCFullYear() < 100) inicio.setUTCFullYear(pagamento.getUTCFullYear());
  return { inicio, fim: new Date(inicio.getTime() + 86_400_000) };
}

/**
 * `_mesmo_pagamento`: o comprovante vivo de mesmo valor, mesmo dia (UTC) e mesma identidade — o
 * documento, ou o nome quando falta documento. Valor e dia sozinhos casariam dois boletos de R$ 500,00
 * de fornecedores diferentes.
 */
export function mesmoPagamento(
  d: Pick<ComprovanteValidado, "dataPagamento" | "cpfCnpj" | "favorecido" | "valorPago">,
  existentes: readonly ComprovanteGravado[],
): ComprovanteGravado | null {
  if (d.dataPagamento === null) return null;
  const documento = soDigitos(d.cpfCnpj);
  const nome = nomeNormalizado(d.favorecido);
  if (!documento && !nome) return null;
  const { inicio, fim } = diaDoPagamento(d.dataPagamento);
  const candidatos = existentes
    .filter((c) => compara(c.valorPago, d.valorPago) === 0 && c.dataPagamento !== null && c.dataPagamento >= inicio && c.dataPagamento < fim)
    .sort(porCriacao);
  for (const c of candidatos) {
    const documentoExistente = soDigitos(c.cpfCnpj);
    if (documento && documentoExistente) {
      if (documento === documentoExistente) return c;
      continue;
    }
    const nomeExistente = nomeNormalizado(c.favorecido);
    if (nome && nomeExistente && nome === nomeExistente) return c;
  }
  return null;
}

/**
 * `criar`, depois de conferir a conta bancária e a transação: o arquivo repetido (sempre recusado) e o
 * possível duplicado (recusado só sem a confirmação). `null` libera a gravação.
 */
export function conferirDuplicidade(d: ComprovanteValidado, sha256: string | null, existentes: readonly ComprovanteGravado[]): RecusaComprovante | null {
  if (sha256) {
    const existente = porArquivo(existentes, sha256);
    if (existente) return erroJaImportado(existente);
  }
  if (!d.permitirDuplicado) {
    const parecido = mesmoPagamento(d, existentes);
    if (parecido) return erroPossivelDuplicado(parecido);
  }
  return null;
}

// ─── Associação ─────────────────────────────────────────────────────────────

/** `associar_transacao`, depois de achar o comprovante: já associado, transação de fora. */
export function conferirAssociacao(c: { transacaoId: string | null }, transacaoEncontrada: boolean): RecusaComprovante | null {
  if (c.transacaoId) return recusa(JA_ASSOCIADO, "CONFLITO");
  if (!transacaoEncontrada) return recusa(TRANSACAO_NAO_ENCONTRADA, "NAO_ENCONTRADA");
  return null;
}

/** `desassociar_transacao`: só o comprovante associado. */
export const conferirDesassociacao = (c: { transacaoId: string | null }): RecusaComprovante | null => (c.transacaoId ? null : recusa(NAO_ASSOCIADO, "CONFLITO"));

// ─── Lista e arquivo ────────────────────────────────────────────────────────

/** O filtro de status do original: "associado" e "nao_associado"; qualquer outro valor não filtra. */
export function filtroDeStatus(status: string | null | undefined): "associado" | "nao_associado" | null {
  return status === "associado" || status === "nao_associado" ? status : null;
}

export const POR_PAGINA_PADRAO = 50;
export const POR_PAGINA_MAXIMO = 200;

/** O tipo de mídia do download, pelo nome do arquivo (`obter_arquivo`). */
export function tipoDoArquivo(nome: string | null): string {
  const n = (nome ?? "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
