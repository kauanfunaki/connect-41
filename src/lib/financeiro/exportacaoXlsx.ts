// A exportação das contas a pagar e a receber em Excel, numa Tabela do Excel
// pronta para a tabela dinâmica (20/10/2026). As linhas são as mesmas do CSV
// (`exportacao.ts`), com dois cuidados a mais:
//
// - **o tipo de cada célula**: vencimento é data, valor é número — o CSV
//   depende de o Excel adivinhar, e a tabela dinâmica precisa agrupar e somar;
// - **o rateio aberto**: a conta rateada sai numa linha por parte, com a
//   categoria, o centro e o projeto da parte e o valor dela. Uma linha só, na
//   categoria da parte maior, faria a tabela dinâmica por categoria somar a
//   conta inteira num lugar só.

import type { LinhaDaConta, TipoDeConta } from "./data";
import { APROVACAO_NA_EXPORTACAO, situacaoNaExportacao } from "./exportacao";
import { partesDoRateio } from "./rateio";
import { gerarPlanilhaDeTabelas, type CelulaDaTabela, type ColunaDaTabela } from "@/lib/planilha/tabelaDoExcel";

/** Uma parte do rateio de uma conta, com os nomes — o que a planilha mostra. */
export type ParteNaPlanilha = { categoriaNome: string | null; centroNome: string | null; projetoNome: string | null; centavos: number };

export function colunasDasContas(kind: TipoDeConta): ColunaDaTabela[] {
  const pagar = kind === "PAGAR";
  return [
    { nome: "Vencimento", tipo: "data" },
    { nome: "Previsão", tipo: "data" },
    { nome: "Situação", tipo: "texto", largura: 14 },
    { nome: pagar ? "Fornecedor" : "Cliente", tipo: "texto", largura: 36 },
    { nome: "Empresa", tipo: "texto", largura: 30 },
    { nome: "Categoria", tipo: "texto", largura: 32 },
    { nome: "Centro de custo", tipo: "texto" },
    { nome: "Projeto", tipo: "texto" },
    { nome: "Parte do rateio", tipo: "texto", largura: 14 },
    { nome: "Competência", tipo: "mes", largura: 12 },
    { nome: "Nº do documento", tipo: "texto", largura: 18 },
    { nome: "Emissão", tipo: "data" },
    { nome: "Descrição", tipo: "texto", largura: 40 },
    { nome: "Valor", tipo: "reais" },
    { nome: pagar ? "Pago" : "Recebido", tipo: "reais" },
    { nome: "Saldo", tipo: "reais" },
    { nome: pagar ? "Pago em" : "Recebido em", tipo: "data" },
    { nome: "Aprovação", tipo: "texto", largura: 20 },
  ];
}

/**
 * As linhas da tabela, na ordem de `colunasDasContas`. A conta rateada vira
 * uma linha por parte: o valor é o da parte, e o pago e o saldo, a proporção
 * dela — a soma das partes dá a conta.
 */
export function linhasDasContas(
  linhas: readonly LinhaDaConta[],
  o: { diaDe: (instante: Date) => string; rateios: ReadonlyMap<string, ParteNaPlanilha[]> }
): CelulaDaTabela[][] {
  const dia = (d: Date | null | undefined) => (d ? o.diaDe(d) : null);
  return linhas.flatMap((l) => {
    const cancelada = l.situacao === "CANCELADA";
    const base = (parte: { categoria: string | null; centro: string | null; projeto: string | null; rotulo: string | null; valor: number; pago: number }) => [
      l.vencimentoKey,
      l.pagoEm ? null : dia(l.previsao),
      situacaoNaExportacao(l),
      l.contraparteNome,
      l.empresaNome,
      parte.categoria,
      parte.centro,
      parte.projeto,
      parte.rotulo,
      l.competencia,
      l.numeroDocumento,
      dia(l.emissao),
      l.descricao,
      parte.valor,
      parte.pago,
      cancelada ? 0 : Math.max(parte.valor - parte.pago, 0),
      dia(l.pagoEm),
      APROVACAO_NA_EXPORTACAO[l.approvalStatus] || null,
    ];
    const partes = o.rateios.get(l.id);
    if (!partes || partes.length < 2) {
      return [base({ categoria: l.categoriaNome, centro: l.centroDeCustoNome, projeto: l.projetoNome, rotulo: null, valor: l.valorCentavos, pago: l.baixadoCentavos })];
    }
    const pagos = partesDoRateio(l.baixadoCentavos, partes);
    return partes.map((p, i) =>
      base({
        categoria: p.categoriaNome,
        centro: p.centroNome,
        projeto: p.projetoNome,
        rotulo: `${i + 1} de ${partes.length}`,
        valor: p.centavos,
        pago: pagos[i]!.centavos,
      })
    );
  });
}

/** O .xlsx das contas: a aba com a tabela e a aba "Filtros" com o que foi exportado. */
export async function xlsxDasContas(
  linhas: readonly LinhaDaConta[],
  kind: TipoDeConta,
  o: { diaDe: (instante: Date) => string; rateios: ReadonlyMap<string, ParteNaPlanilha[]>; filtros: [string, string][] }
): Promise<Buffer> {
  const pagar = kind === "PAGAR";
  return gerarPlanilhaDeTabelas({
    abas: [
      {
        aba: pagar ? "Contas a pagar" : "Contas a receber",
        tabela: pagar ? "ContasAPagar" : "ContasAReceber",
        colunas: colunasDasContas(kind),
        linhas: linhasDasContas(linhas, o),
        semLinhas: "Nenhuma conta no recorte escolhido.",
      },
    ],
    filtros: o.filtros,
  });
}
