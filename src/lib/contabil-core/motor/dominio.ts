// Porte de `src/domain/exportacao/formatos.py` e `historico.py` do Contábil Core: o arquivo de
// importação de lançamentos do Domínio (TXT e CSV) e a política de histórico do arquivo.

import { fixo, texto as decTexto, type Dec } from "./decimal";
import { normalizarParaMatch } from "./texto";
import { split, strip } from "./unicodePy";

/** A grafia destes cabeçalhos é contrato com o sistema contábil do escritório. */
export const COLUNAS_LANCAMENTOS_IMPORTACAO = [
  "Data", "Cód. Conta Debito", "Cód. Conta Credito", "Valor",
  "Cód. Histórico", "Complemento Histórico", "Inicia Lote",
  "Código Matriz/Filial", "Centro de Custo Débito", "Centro de Custo Crédito",
] as const;

export type Celula = string | Dec;
export type Linha = Partial<Record<string, Celula>>;

function ehDec(v: Celula): v is Dec {
  return typeof v === "object";
}

/** O valor no padrão do TXT do escritório: vírgula decimal e sem zeros à direita (1500,1). */
export function formatarValorBr(valor: Dec): string {
  let t = fixo(valor);
  if (t.includes(".")) t = t.replace(/0+$/, "").replace(/\.$/, "");
  return t.replace(/\./g, ",");
}

/**
 * Neutraliza fórmula em qualquer texto que sai em CSV, TXT ou XLSX: quem abre o arquivo no Excel não
 * pode executar `=…` vindo de um histórico bancário. Número (Dec) passa intacto.
 */
export function celulaSegura<T extends Celula>(valor: T): T | string {
  // `value.lstrip().startswith(...)`: o primeiro caractere depois dos espaços é o mesmo do `strip`.
  if (typeof valor === "string" && /^[=+\-@]/.test(strip(valor))) return "'" + valor;
  return valor;
}

/** A célula como o `csv` do Python a escreve: aspas só quando precisa, aspas internas dobradas. */
function campoCsv(valor: Celula, delimitador: string): string {
  const t = ehDec(valor) ? decTexto(valor) : valor;
  if (t.includes(delimitador) || t.includes('"') || t.includes("\r") || t.includes("\n")) {
    return '"' + t.replace(/"/g, '""') + '"';
  }
  return t;
}

const BOM = "﻿";

/** TXT do Domínio: `;`, SEM cabeçalho, valor com vírgula e BOM UTF-8. Só `Valor` vira número BR:
 * código de conta pode ter ponto de verdade e não é decimal. */
export function linhasParaTxt(linhas: readonly Linha[], colunas: readonly string[] = COLUNAS_LANCAMENTOS_IMPORTACAO): string {
  let out = "";
  for (const linha of linhas) {
    const campos = colunas.map((coluna) => {
      let v: Celula = linha[coluna] ?? "";
      if (coluna === "Valor") v = typeof v === "string" ? v : formatarValorBr(v);
      return campoCsv(celulaSegura(v), ";");
    });
    out += campos.join(";") + "\r\n";
  }
  return BOM + out;
}

/** CSV com cabeçalho, separador vírgula e BOM UTF-8. */
export function linhasParaCsv(linhas: readonly Linha[], colunas: readonly string[] = COLUNAS_LANCAMENTOS_IMPORTACAO): string {
  let out = colunas.map((c) => campoCsv(c, ",")).join(",") + "\r\n";
  for (const linha of linhas) {
    out += colunas.map((coluna) => campoCsv(celulaSegura(linha[coluna] ?? ""), ",")).join(",") + "\r\n";
  }
  return BOM + out;
}

const PREFIXOS_PRESERVADOS = ["pgto ref", "valor ref", "rec ref", "vlr ref"];
const TOKENS_APLICACAO = new Set(["aplic", "aplicacao", "aplicacoes"]);

/**
 * O prefixo contábil do arquivo do Domínio (ADR-015): `PGTO REF` em débito e `VALOR REF` em crédito,
 * pela direção da transação bancária. Preserva histórico que já começa com um prefixo (inclusive os
 * legados `REC REF` e `VLR REF`) e aplicações/resgates, que o time contábil validou sem prefixo. Só
 * muda o arquivo: o histórico gravado não é reescrito.
 */
export function historicoParaDominio(historicoExtrato: string, dcTransacao: string): string {
  const historico = strip(historicoExtrato);
  if (!historico) return "";

  const normalizado = normalizarParaMatch(historico);
  if (PREFIXOS_PRESERVADOS.some((p) => normalizado === p || normalizado.startsWith(`${p} `))) return historico;

  const tokens = new Set(split(normalizado));
  if (tokens.has("resgate") || [...tokens].some((t) => TOKENS_APLICACAO.has(t))) return historico;

  if (dcTransacao === "D") return `PGTO REF ${historico}`;
  if (dcTransacao === "C") return `VALOR REF ${historico}`;
  throw new RangeError("dc_transacao deve ser 'D' ou 'C'");
}
