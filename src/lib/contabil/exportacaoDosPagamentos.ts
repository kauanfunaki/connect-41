// Os arquivos dos Pagamentos sem nota (03/11/2026), com as colunas do motor
// (`csv_apoio_lancamentos` e `csv_apoio_pendencias`): o CSV de conferência dos
// lançamentos e o das pendências, que volta preenchido do contábil. A planilha
// de importação da Domínio é a comum, `financeiro/dominio/planilha.ts`.
//
// Ponto e vírgula e vírgula decimal, que o Excel em português abre sem
// perguntar; campo com ";", aspas ou quebra de linha vai entre aspas, e texto
// que começa como fórmula ganha um apóstrofo — o nome do fornecedor é campo livre.

import type { LinhaDaDominio } from "@/lib/financeiro/dominio/planilha";
import type { LancamentoDoPagamento, PendenciaDoPagamento } from "./pagamentos";

type Celula = string | number;

function campo(v: Celula): string {
  if (typeof v === "number") return (v / 100).toFixed(2).replace(".", ",");
  let t = v ?? "";
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** O CSV, com BOM para o Excel reconhecer o UTF-8. Número é centavos. */
export function csv(cabecalho: readonly string[], linhas: readonly Celula[][]): string {
  return "﻿" + [cabecalho.map(campo), ...linhas.map((l) => l.map(campo))].map((l) => l.join(";")).join("\n");
}

/**
 * O histórico como a Domínio vai escrever: a descrição do código e depois o
 * complemento. O Connect não tem a relação de históricos da Domínio, então o
 * código sai marcado — a frase não pode parecer completa sem ser.
 */
export function historicoNaDominio(codigo: string, complemento: string, descricoes: ReadonlyMap<string, string> = new Map()): string {
  const c = (codigo ?? "").trim();
  const resto = (complemento ?? "").trim();
  if (!c) return resto;
  const descricao = (descricoes.get(c) ?? "").trim();
  return descricao ? `${descricao} ${resto}`.trim() : `[histórico ${c} não carregado] ${resto}`.trim();
}

export const COLUNAS_DOS_LANCAMENTOS = [
  "debito", "credito", "valor", "data", "codigo_historico", "historico", "historico_na_dominio",
  "origem_do_credito", "tipo_documento", "categoria", "cpf_cnpj", "nome", "competencia",
  "documento_fonte", "caminho_do_documento", "debito_na_regra", "debito_no_plano", "credito_na_regra", "credito_no_plano",
] as const;

/** Os lançamentos, com a origem do documento: um R$ 6.250 não diz sozinho se veio de RPA, contrato ou recibo. */
export function csvDosLancamentos(lancamentos: readonly LancamentoDoPagamento[], nomeDaConta: (conta: string) => string): string {
  return csv(COLUNAS_DOS_LANCAMENTOS, lancamentos.map((l) => [
    l.debito, l.credito, l.centavos, l.data, l.codigoHistorico, l.historico, historicoNaDominio(l.codigoHistorico, l.historico),
    l.origemDoCredito, l.tipoDocumento, l.categoria, l.cpfCnpj, l.nome, l.competencia,
    // Sem pasta de rede no Connect: o documento abre pela tela.
    l.fonte, "",
    l.debito, nomeDaConta(l.debito) || "FORA DO PLANO", l.credito, nomeDaConta(l.credito) || "FORA DO PLANO",
  ]));
}

export const COLUNAS_DAS_PENDENCIAS = [
  "o_que_falta", "chave", "nome", "conta_a_preencher", "por_que_esta_fora", "conta_sugerida",
  "categoria", "tipo_documento", "qtd_documentos", "valor_total", "exemplos", "caminhos",
] as const;

/** O que falta cadastrar, com a conta em branco para o contábil preencher e devolver. */
export function csvDasPendencias(pendencias: readonly PendenciaDoPagamento[]): string {
  return csv(COLUNAS_DAS_PENDENCIAS, pendencias.map((p) => [
    p.falta, p.chave, p.rotulo, "", p.motivo, p.sugestao ? `${p.sugestao.reduzido || p.sugestao.classificacao} - ${p.sugestao.nome}` : "",
    p.categoria, p.tipoDocumento, String(p.documentos), p.centavos, p.exemplos.map((x) => x.fonte).join(" | "), "",
  ]));
}

/** O nome do arquivo do motor: `lancamentos_pagamentos_{cnpj}_{competencia}`. */
export const nomeDoArquivoDosPagamentos = (cnpj: string, competencia: string, extensao: string) => `lancamentos_pagamentos_${cnpj.replace(/\D/g, "")}_${competencia}.${extensao}`;

/** As linhas da planilha de importação da Domínio, todas na filial da matriz. */
export function linhasDosPagamentos(lancamentos: readonly LancamentoDoPagamento[], codigoFilial: string): LinhaDaDominio[] {
  return lancamentos.map((l) => ({ dataKey: l.data, debito: l.debito, credito: l.credito, centavos: l.centavos, codigoHistorico: l.codigoHistorico, complemento: l.historico, codigoFilial }));
}
