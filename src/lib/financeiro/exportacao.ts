// A exportação das listas de contas a pagar e a receber (lote D da fila do BPO,
// 20/10: "exportar cada lista", como o Omie faz). Função pura: as linhas já
// vêm de `listarContas`, com os filtros da tela; aqui só viram CSV.
//
// O formato é o da exportação das horas (`/gestao/horas/exportar`): separador
// ";", vírgula decimal, data dd/mm/aaaa e o BOM do UTF-8 — é o que o Excel em
// português abre direto, com acento e com número que soma.

import { formatarNumero } from "@/lib/format";
import type { LinhaDaConta, TipoDeConta } from "./data";
import type { RecorteDeContas, SituacaoDaConta } from "./contas";

/** Os recortes de cada lado, na ordem dos botões da tela. */
export const RECORTES_A_PAGAR = [
  { chave: "avencer", rotulo: "A vencer" },
  { chave: "vencidas", rotulo: "Vencido" },
  { chave: "hoje", rotulo: "Vence hoje" },
  { chave: "todas", rotulo: "Todas" },
] as const satisfies readonly { chave: RecorteDeContas; rotulo: string }[];

export const RECORTES_A_RECEBER = [
  { chave: "abertas", rotulo: "Em aberto" },
  { chave: "vencidas", rotulo: "Vencidas" },
  { chave: "todas", rotulo: "Todas" },
] as const satisfies readonly { chave: RecorteDeContas; rotulo: string }[];

/** O recorte da URL, se for um dos deste lado; senão "todas", como a tela. */
export function recorteDaUrl(kind: TipoDeConta, valor: string | null | undefined): RecorteDeContas {
  const recortes: readonly { chave: RecorteDeContas }[] = kind === "PAGAR" ? RECORTES_A_PAGAR : RECORTES_A_RECEBER;
  return recortes.find((r) => r.chave === valor)?.chave ?? "todas";
}

/** Teto da exportação: o arquivo cabe no Excel e a consulta não pesa. A tela para em mil. */
export const LIMITE_DA_EXPORTACAO = 20000;

const SITUACAO: Record<SituacaoDaConta, string> = {
  VENCIDA: "Vencida",
  VENCE_HOJE: "Vence hoje",
  A_VENCER: "A vencer",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

const APROVACAO: Record<LinhaDaConta["approvalStatus"], string> = {
  NAO_REQUER: "",
  AGUARDANDO: "Aguardando aprovação",
  APROVADO: "Aprovada",
  REPROVADO: "Reprovada",
};

/**
 * Uma célula de texto, entre aspas. Texto que começa com `=`, `+`, `-` ou `@`
 * ganha um apóstrofo na frente: o Excel leria como fórmula — e o nome de um
 * fornecedor vem de nota fiscal e de cadastro, não de quem confia na planilha.
 */
export function celula(texto: string | null | undefined): string {
  const t = texto ?? "";
  const seguro = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/** Reais com vírgula decimal e sem separador de milhar — "1234,56", "-10,00". */
export function reais(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sinal}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA"; vazio fica vazio. */
export function data(chave: string | null | undefined): string {
  if (!chave) return "";
  const [a, m, d] = chave.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

/** "AAAA-MM" → "MM/AAAA". */
const competencia = (c: string) => (/^\d{4}-\d{2}$/.test(c) ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : c);

export type OpcoesDoCsv = {
  /** A chave de um instante em São Paulo ("AAAA-MM-DD") — vem de quem chama, para o teste não depender de fuso. */
  diaDe: (instante: Date) => string;
  /** A lista parou no teto: a última linha avisa. */
  limitada?: boolean;
};

/**
 * O CSV da lista, uma conta por linha, com tudo o que a tela mostra e o que
 * ela resume (a empresa, o centro, o projeto, a aprovação). A situação é a da
 * tela: cancelada por renegociação ou perda diz o nome.
 */
export function csvDasContas(linhas: readonly LinhaDaConta[], kind: TipoDeConta, o: OpcoesDoCsv): string {
  const cabecalho = [
    "Vencimento",
    "Situação",
    kind === "PAGAR" ? "Fornecedor" : "Cliente",
    "Empresa",
    "Categoria",
    "Centro de custo",
    "Projeto",
    "Competência",
    "Nº do documento",
    "Emissão",
    "Descrição",
    "Valor (R$)",
    kind === "PAGAR" ? "Pago (R$)" : "Recebido (R$)",
    "Saldo (R$)",
    kind === "PAGAR" ? "Pago em" : "Recebido em",
    "Aprovação",
  ];
  const corpo = linhas.map((l) => {
    const situacao =
      l.closeReason === "RENEGOCIADO" ? "Renegociada" : l.closeReason === "PERDA" ? "Perda" : SITUACAO[l.situacao];
    const saldo = l.situacao === "CANCELADA" ? 0 : Math.max(l.valorCentavos - l.baixadoCentavos, 0);
    return [
      data(l.vencimentoKey),
      celula(situacao),
      celula(l.contraparteNome),
      celula(l.empresaNome),
      celula(l.categoriaNome),
      celula(l.centroDeCustoNome),
      celula(l.projetoNome),
      competencia(l.competencia),
      celula(l.numeroDocumento),
      l.emissao ? data(o.diaDe(l.emissao)) : "",
      celula(l.descricao),
      reais(l.valorCentavos),
      reais(l.baixadoCentavos),
      reais(saldo),
      l.pagoEm ? data(o.diaDe(l.pagoEm)) : "",
      celula(APROVACAO[l.approvalStatus]),
    ].join(";");
  });
  const aviso = o.limitada
    ? [celula(`Exportação limitada a ${formatarNumero(LIMITE_DA_EXPORTACAO, 0)} contas — filtre por empresa ou competência para ver o resto.`)]
    : [];
  return "﻿" + [cabecalho.join(";"), ...corpo, ...aviso].join("\r\n");
}
