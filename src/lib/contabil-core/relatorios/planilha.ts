// A planilha dos relatórios (Bloco D, Fase D2, 26/11/2026). Novo no Connect: a página do original só
// imprimia (`window.print`). As abas vão pela `gerarPlanilhaDeTabelas` (`src/lib/planilha/tabelaDoExcel.ts`),
// a mesma das outras exportações em Excel do Connect: o dinheiro como número (do texto exato do decimal), a
// data como data e o texto como texto. Os números são os da tela, sem conta nova.

import { formatCnpj } from "@/lib/format";
import type { AbaDaTabela, PlanilhaDeTabelas } from "@/lib/planilha/tabelaDoExcel";
import type { Balancete, Dre, LivroCaixa, Periodo } from "./relatorios";

export const RELATORIOS = ["dre", "balancete", "livro-caixa"] as const;
export type QualRelatorio = (typeof RELATORIOS)[number];

export const TITULO_DO_RELATORIO: Record<QualRelatorio, string> = {
  dre: "DRE",
  balancete: "Balancete de Verificação",
  "livro-caixa": "Livro Caixa",
};

const brData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "01/03/2026 a 31/03/2026", "a partir de 01/03/2026", "até 31/03/2026" ou "Todo o período". */
export function rotuloDoPeriodo(p: Periodo): string {
  if (p.de && p.ate) return `${brData(p.de)} a ${brData(p.ate)}`;
  if (p.de) return `a partir de ${brData(p.de)}`;
  if (p.ate) return `até ${brData(p.ate)}`;
  return "Todo o período";
}

function abasDaDre(r: Dre): AbaDaTabela[] {
  return [
    {
      aba: "DRE",
      tabela: "DRE",
      colunas: [
        { nome: "Grupo", tipo: "texto", largura: 12 },
        { nome: "Código", tipo: "texto", largura: 16 },
        { nome: "Descrição", tipo: "texto", largura: 40 },
        { nome: "Débitos", tipo: "reais", largura: 16 },
        { nome: "Créditos", tipo: "reais", largura: 16 },
        { nome: "Saldo", tipo: "reais", largura: 16 },
      ],
      linhas: r.grupos.flatMap((g) => g.linhas.map((l) => [g.label, l.codigo, l.descricao, l.debitos, l.creditos, l.saldo])),
      semLinhas: "Nenhum lançamento encontrado no período.",
    },
    {
      aba: "Resultado",
      tabela: "Resultado",
      colunas: [
        { nome: "Linha", tipo: "texto", largura: 24 },
        { nome: "Valor", tipo: "reais", largura: 18 },
      ],
      linhas: [
        ["Receitas", r.totalReceitas],
        ["Custos", r.totalCustos],
        ["Despesas", r.totalDespesas],
        ["Resultado líquido", r.resultadoLiquido],
      ],
    },
  ];
}

function abasDoBalancete(r: Balancete): AbaDaTabela[] {
  return [
    {
      aba: "Balancete",
      tabela: "Balancete",
      colunas: [
        { nome: "Código", tipo: "texto", largura: 16 },
        { nome: "Descrição", tipo: "texto", largura: 40 },
        { nome: "Tipo", tipo: "texto", largura: 18 },
        { nome: "Nível", tipo: "inteiro", largura: 8 },
        { nome: "Débitos", tipo: "reais", largura: 16 },
        { nome: "Créditos", tipo: "reais", largura: 16 },
        { nome: "Saldo devedor", tipo: "reais", largura: 16 },
        { nome: "Saldo credor", tipo: "reais", largura: 16 },
      ],
      linhas: r.linhas.map((l) => [l.codigo, l.descricao, l.tipo, l.nivel, l.debitos, l.creditos, l.saldoDevedor, l.saldoCredor]),
      semLinhas: "Nenhuma conta encontrada.",
    },
    {
      aba: "Totais",
      tabela: "Totais",
      colunas: [
        { nome: "Total", tipo: "texto", largura: 24 },
        { nome: "Valor", tipo: "reais", largura: 18 },
      ],
      linhas: [
        ["Débitos", r.totalDebitos],
        ["Créditos", r.totalCreditos],
        ["Saldo devedor", r.totalSaldoDevedor],
        ["Saldo credor", r.totalSaldoCredor],
      ],
    },
  ];
}

function abasDoLivro(r: LivroCaixa): AbaDaTabela[] {
  return [
    {
      aba: "Livro Caixa",
      tabela: "Livro_Caixa",
      colunas: [
        { nome: "Conta bancária", tipo: "texto", largura: 26 },
        { nome: "Data", tipo: "data" },
        { nome: "Histórico", tipo: "texto", largura: 44 },
        { nome: "D/C", tipo: "texto", largura: 6 },
        { nome: "Valor", tipo: "reais", largura: 16 },
        { nome: "Saldo acumulado", tipo: "reais", largura: 18 },
      ],
      linhas: r.agencias.flatMap((a) => a.lancamentos.map((l) => [a.descricao, l.data, l.historico, l.dc, l.valor, l.saldoAcumulado])),
      semLinhas: r.agencias.length ? "Sem movimentações no período." : "Nenhuma conta bancária cadastrada.",
    },
    {
      aba: "Saldos",
      tabela: "Saldos",
      colunas: [
        { nome: "Conta bancária", tipo: "texto", largura: 26 },
        { nome: "Saldo inicial", tipo: "reais", largura: 18 },
        { nome: "Débitos", tipo: "reais", largura: 16 },
        { nome: "Créditos", tipo: "reais", largura: 16 },
        { nome: "Saldo final", tipo: "reais", largura: 18 },
      ],
      linhas: r.agencias.map((a) => [a.descricao, a.saldoInicial, a.totalDebitos, a.totalCreditos, a.saldoFinal]),
      semLinhas: "Nenhuma conta bancária cadastrada.",
    },
  ];
}

/** A planilha de um relatório, com a aba "Filtros" (empresa, relatório e período). */
export function planilhaDoRelatorio(
  qual: QualRelatorio,
  r: Dre | Balancete | LivroCaixa,
  empresa: { razaoSocial: string; cnpj: string },
  periodo: Periodo,
): PlanilhaDeTabelas {
  const abas = qual === "dre" ? abasDaDre(r as Dre) : qual === "balancete" ? abasDoBalancete(r as Balancete) : abasDoLivro(r as LivroCaixa);
  return {
    abas,
    filtros: [
      ["Empresa", `${empresa.razaoSocial} · ${formatCnpj(empresa.cnpj)}`],
      ["Relatório", TITULO_DO_RELATORIO[qual]],
      ["Período", rotuloDoPeriodo(periodo)],
      ["Fonte", "Contábil Core no Connect: os mesmos números da aba Relatórios."],
    ],
  };
}

/** `<relatório>-<cnpj só com dígitos>-<de>-<ate>.xlsx` (o período que faltar não entra). */
export function nomeDaPlanilha(qual: QualRelatorio, cnpj: string, p: Periodo): string {
  return [qual, cnpj.replace(/\D/g, ""), ...(p.de ? [p.de] : []), ...(p.ate ? [p.ate] : [])].join("-") + ".xlsx";
}
