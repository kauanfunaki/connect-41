// A apuração e o livro fiscal do SPED para fora do Connect (29/10/2026). Puro.
//
// Uma planilha com uma aba por quadro — a apuração (E110), as conferências,
// os ajustes (E111), as operações por CFOP e o livro de saídas e de entradas —
// e o CSV do livro, para outros sistemas. Dinheiro sai como número (a
// `tabelaDoExcel` divide os centavos por cem) e alíquota como percentual.

import type { AbaDaTabela, CelulaDaTabela } from "@/lib/planilha/tabelaDoExcel";
import { CAMPOS_E110, GRUPOS_DA_APURACAO, NATUREZAS, type LeituraDaApuracao, type LinhaDoLivro, type LivroFiscal } from "./arquivoIcms";

// A alíquota anda em centésimos de ponto (18,00% = 1800): a coluna "reais" da
// planilha divide por cem e formata com duas casas, que é o que se quer.

function linhasDoLivro(livro: LivroFiscal): CelulaDaTabela[][] {
  const linha = (quadro: string, l: LinhaDoLivro): CelulaDaTabela[] => [quadro, l.cfop, l.aliquota, l.valorContabil, l.baseCalculo, l.imposto, l.isentas, l.outras];
  return [...livro.saidas.map((l) => linha("Saídas", l)), ...livro.entradas.map((l) => linha("Entradas", l))];
}

export function abasDaApuracao(a: LeituraDaApuracao, livro: LivroFiscal): AbaDaTabela[] {
  return [
    {
      aba: "Apuração E110", tabela: "Apuracao_E110",
      colunas: [{ nome: "Campo", tipo: "texto", largura: 28 }, { nome: "Descrição", tipo: "texto", largura: 40 }, { nome: "Valor", tipo: "reais" }],
      linhas: a.e110 ? CAMPOS_E110.map(([campo, rotulo]) => [campo, rotulo, a.e110![campo]]) : [],
      semLinhas: "O arquivo não tem o registro E110.",
    },
    {
      aba: "Conferências", tabela: "Conferencias",
      colunas: [{ nome: "Regra", tipo: "texto", largura: 80 }, { nome: "Esperado", tipo: "reais" }, { nome: "No arquivo", tipo: "reais" }, { nome: "Situação", tipo: "texto", largura: 12 }],
      linhas: a.conferencias.map((c) => [c.regra, c.esperado, c.obtido, c.bate ? "Bate" : "Diverge"]),
    },
    {
      aba: "Ajustes E111", tabela: "Ajustes_E111",
      colunas: [{ nome: "Código", tipo: "texto", largura: 14 }, { nome: "Descrição", tipo: "texto", largura: 50 }, { nome: "Natureza", tipo: "texto", largura: 20 }, { nome: "Valor", tipo: "reais" }],
      linhas: a.ajustes.map((x) => [x.codigo, x.descricao, NATUREZAS[x.natureza], x.valor]),
      semLinhas: "Nenhum ajuste no arquivo.",
    },
    {
      aba: "Operações por CFOP", tabela: "Operacoes_por_CFOP",
      colunas: [
        { nome: "Grupo", tipo: "texto", largura: 18 }, { nome: "CFOP", tipo: "texto", largura: 8 }, { nome: "CST", tipo: "texto", largura: 8 },
        { nome: "Alíquota (%)", tipo: "reais", largura: 12 }, { nome: "Registros", tipo: "inteiro" }, { nome: "Valor da operação", tipo: "reais" },
        { nome: "Base de cálculo", tipo: "reais" }, { nome: "ICMS", tipo: "reais" },
      ],
      linhas: GRUPOS_DA_APURACAO.flatMap((g) => a.grupos[g.chave].map((l) => [g.rotulo, l.cfop, l.cst, l.aliquota, l.qtd, l.valorOperacao, l.valorBc, l.valorIcms])),
    },
    {
      aba: "Livro fiscal", tabela: "Livro_fiscal",
      colunas: [
        { nome: "Quadro", tipo: "texto", largura: 12 }, { nome: "CFOP", tipo: "texto", largura: 8 }, { nome: "Alíquota (%)", tipo: "reais", largura: 12 },
        { nome: "Valor contábil", tipo: "reais" }, { nome: "Base de cálculo", tipo: "reais" }, { nome: "Imposto", tipo: "reais" },
        { nome: "Isentas", tipo: "reais" }, { nome: "Outras", tipo: "reais" },
      ],
      linhas: linhasDoLivro(livro),
    },
    {
      aba: "Débitos e créditos", tabela: "Debitos_e_creditos",
      colunas: [{ nome: "Quadro", tipo: "texto", largura: 12 }, { nome: "Descrição", tipo: "texto", largura: 60 }, { nome: "Valor", tipo: "reais" }],
      linhas: [
        ...livro.debitos.map((v) => ["Débitos", v.descricao, v.valor]),
        ...livro.creditos.map((v) => ["Créditos", v.descricao, v.valor]),
        ...livro.apuracao.map((v) => ["Apuração", v.descricao, v.valor]),
      ],
    },
  ];
}

/** "1234.56" com vírgula, como o Excel em português lê; o CSV sai com ponto e vírgula. */
const decimal = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");
const campo = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** O livro fiscal em CSV (ponto e vírgula, BOM para o Excel abrir com acento). */
export function csvDoLivro(livro: LivroFiscal): string {
  const cabecalho = ["Quadro", "CFOP", "Alíquota (%)", "Valor contábil", "Base de cálculo", "Imposto", "Isentas", "Outras"];
  const linhas = [
    ...livro.saidas.map((l) => ["Saídas", l] as const),
    ...livro.entradas.map((l) => ["Entradas", l] as const),
  ].map(([quadro, l]) => [quadro, l.cfop, decimal(l.aliquota), decimal(l.valorContabil), decimal(l.baseCalculo), decimal(l.imposto), decimal(l.isentas), decimal(l.outras)]);
  return `﻿${[cabecalho, ...linhas].map((l) => l.map(campo).join(";")).join("\r\n")}\r\n`;
}
