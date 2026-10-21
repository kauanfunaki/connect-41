// A tabela dinâmica em Excel (20/10/2026). Função pura: a tabela montada, os
// fatos e a configuração viram as abas da planilha — o arquivo é do gerador
// genérico (`lib/planilha/tabelaDoExcel.ts`).
//
// Três abas: a tabela como a tela mostra (sem os subtotais, que numa Tabela do
// Excel atrapalhariam quem filtra e soma), os dados linha a linha — para quem
// quer montar a própria tabela dinâmica no Excel — e os filtros usados.

import type { AbaDaTabela, ColunaDaTabela, PlanilhaDeTabelas } from "@/lib/planilha/tabelaDoExcel";
import { DIMENSOES, MEDIDAS, type Configuracao, type Dimensao, type Fato, type Medida, type Tabela } from "./tabelaDinamica";

/** Nomes de coluna repetidos ganham " (2)", " (3)": a Tabela do Excel não aceita dois iguais. */
function semRepetir(nomes: string[]): string[] {
  const vistos = new Map<string, number>();
  return nomes.map((n) => {
    const chave = n.toLowerCase();
    const vezes = (vistos.get(chave) ?? 0) + 1;
    vistos.set(chave, vezes);
    return vezes === 1 ? n : `${n} (${vezes})`;
  });
}

export function abaDaTabelaMontada(t: Tabela, c: Configuracao): AbaDaTabela {
  const tipo = MEDIDAS[c.medida].tipo === "contagem" ? "inteiro" : "reais";
  const valores = c.coluna ? t.colunas.map((col) => col.rotulo) : [];
  const nomes = semRepetir([...c.linhas.map((d) => DIMENSOES[d].rotulo), ...valores, "Total"]);
  const colunas: ColunaDaTabela[] = nomes.map((nome, i) => ({ nome, tipo: i < c.linhas.length ? "texto" : tipo, largura: i < c.linhas.length ? 32 : 14 }));
  const numeros = (l: { valores: number[]; total: number }) => [...(c.coluna ? l.valores : []), l.total];
  const linhas = t.linhas.flatMap((l) =>
    c.linhas.length === 2 && l.filhas ? l.filhas.map((f) => [l.rotulo, f.rotulo, ...numeros(f)]) : [[l.rotulo, ...numeros(l)]]
  );
  return { aba: "Tabela dinâmica", tabela: "TabelaDinamica", colunas, linhas, semLinhas: "Nada neste recorte." };
}

export function abaDosDados(fatos: readonly Fato[], c: Configuracao): AbaDaTabela {
  const dims = (Object.keys(DIMENSOES) as Dimensao[]).filter((d) => DIMENSOES[d].bases.includes(c.base));
  // A quantidade é da tabela (contas distintas), não de uma linha.
  const medidas = (Object.keys(MEDIDAS) as Medida[]).filter((m) => MEDIDAS[m].bases.includes(c.base) && MEDIDAS[m].tipo === "reais");
  return {
    aba: "Dados",
    tabela: "Dados",
    colunas: [
      ...dims.map((d): ColunaDaTabela => ({ nome: DIMENSOES[d].rotulo, tipo: DIMENSOES[d].tempo ? "mes" : "texto", largura: DIMENSOES[d].tempo ? 12 : 28 })),
      ...medidas.map((m): ColunaDaTabela => ({ nome: MEDIDAS[m].rotulo, tipo: "reais", largura: 16 })),
    ],
    linhas: fatos.map((f) => [...dims.map((d) => f.dims[d] ?? null), ...medidas.map((m) => f.medidas[m] ?? 0)]),
    semLinhas: "Nada neste recorte.",
  };
}

export function planilhaDaTabelaDinamica(t: Tabela, fatos: readonly Fato[], c: Configuracao, filtros: [string, string][]): PlanilhaDeTabelas {
  return { abas: [abaDaTabelaMontada(t, c), abaDosDados(fatos, c)], filtros };
}
