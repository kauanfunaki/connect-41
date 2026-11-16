import { describe, expect, it } from "vitest";
import { abaDaTabelaMontada } from "./exportacaoDaTabela";
import { lerConfiguracao, montarTabela, type Fato } from "./tabelaDinamica";

// 16/11/2026 (melhoria-719): as linhas da tabela vão até três níveis, e a aba
// "Tabela dinâmica" da exportação leva um rótulo por nível em cada linha.

const fato = (chave: string, dims: Fato["dims"], valor: number): Fato => ({ chave, dims, medidas: { valor } });

const fatos = [
  fato("1", { grupo: "Despesas fixas", categoria: "Aluguel", centro: "Loja A", competencia: "2026-09" }, 1_000),
  fato("2", { grupo: "Despesas fixas", categoria: "Aluguel", centro: "Loja B", competencia: "2026-10" }, 500),
  fato("3", { grupo: "Despesas fixas", categoria: "Água", centro: "Loja A", competencia: "2026-09" }, 300),
  fato("4", { grupo: "Impostos", categoria: "ISS", centro: null, competencia: "2026-10" }, 50),
];

const aba = (params: Record<string, string>) => {
  const c = lerConfiguracao(params, "2026-11-16");
  return abaDaTabelaMontada(montarTabela(fatos, c), c);
};

describe("abaDaTabelaMontada", () => {
  it("um nível: uma linha por valor, com as colunas e o total", () => {
    const a = aba({ linhas: "categoria", coluna: "competencia" });
    expect(a.colunas.map((c) => c.nome)).toEqual(["Categoria", "Set/26", "Out/26", "Total"]);
    expect(a.linhas).toEqual([
      ["Aluguel", 1_000, 500, 1_500],
      ["Água", 300, 0, 300],
      ["ISS", 0, 50, 50],
    ]);
  });

  it("dois níveis: só o detalhe vira linha, com o grupo à frente (como antes)", () => {
    const a = aba({ linhas: "grupo,categoria", coluna: "nenhuma" });
    expect(a.colunas.map((c) => [c.nome, c.tipo])).toEqual([
      ["Grupo do plano de contas", "texto"],
      ["Categoria", "texto"],
      ["Total", "reais"],
    ]);
    expect(a.linhas).toEqual([
      ["Despesas fixas", "Aluguel", 1_500],
      ["Despesas fixas", "Água", 300],
      ["Impostos", "ISS", 50],
    ]);
  });

  it("três níveis: um rótulo por nível, sem os subtotais", () => {
    const a = aba({ linhas: "grupo,categoria,centro", coluna: "competencia" });
    expect(a.colunas.map((c) => c.nome)).toEqual(["Grupo do plano de contas", "Categoria", "Centro de custo", "Set/26", "Out/26", "Total"]);
    expect(a.linhas).toEqual([
      ["Despesas fixas", "Aluguel", "Loja A", 1_000, 0, 1_000],
      ["Despesas fixas", "Aluguel", "Loja B", 0, 500, 500],
      ["Despesas fixas", "Água", "Loja A", 300, 0, 300],
      ["Impostos", "ISS", "(sem centro de custo)", 0, 50, 50],
    ]);
    // A soma das linhas é o total da tabela: nenhum subtotal entrou.
    expect(a.linhas.reduce((s, l) => s + (l.at(-1) as number), 0)).toBe(1_850);
  });
});
