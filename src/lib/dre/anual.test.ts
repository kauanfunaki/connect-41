import { describe, it, expect } from "vitest";
import { dreDoAno, linhaAoLongoDoAno, type MesDoAno } from "./anual";
import { LINHAS } from "./estrutura";

function mes(n: number, receita: number, cmv: number, impostos = 0): MesDoAno {
  return {
    mes: n,
    porGrupo: { receita_bruta: receita, custo_operacional: cmv, impostos },
    temMovimento: true,
  };
}

describe("dreDoAno", () => {
  it("sempre devolve doze meses mais média e ano", () => {
    const a = dreDoAno([]);
    expect(a.colunas).toHaveLength(14);
    expect(a.colunas.map((c) => c.rotulo).slice(-2)).toEqual(["Média", "Ano"]);
    expect(a.colunas[0]!.mes).toBe(1);
    expect(a.colunas[13]!.mes).toBeNull();
  });

  it("mês sem dado sai zerado, e não ausente", () => {
    const a = dreDoAno([mes(3, 100_000, -40_000)]);
    const receita = linhaAoLongoDoAno(a, "receita_bruta");
    expect(receita[0]!.centavos).toBe(0);
    expect(receita[2]!.centavos).toBe(100_000);
  });

  it("a coluna do ano soma os meses", () => {
    const a = dreDoAno([mes(1, 100_000, -40_000), mes(2, 300_000, -60_000)]);
    const receita = linhaAoLongoDoAno(a, "receita_bruta");
    expect(receita[13]!.centavos).toBe(400_000);
    expect(linhaAoLongoDoAno(a, "custo_operacional")[13]!.centavos).toBe(-100_000);
  });

  // `AVERAGE` no Excel pula célula vazia. Dividir por doze em setembro diz que
  // a empresa faturou 25% menos do que faturou.
  it("a média divide pelos meses com movimento, não por doze", () => {
    const a = dreDoAno([mes(1, 100_000, 0), mes(2, 300_000, 0)]);
    expect(a.mesesComMovimento).toBe(2);
    expect(linhaAoLongoDoAno(a, "receita_bruta")[12]!.centavos).toBe(200_000);
  });

  it("mês declarado sem movimento não entra na média", () => {
    const a = dreDoAno([
      mes(1, 100_000, 0),
      { mes: 2, porGrupo: {}, temMovimento: false },
    ]);
    expect(a.mesesComMovimento).toBe(1);
    expect(linhaAoLongoDoAno(a, "receita_bruta")[12]!.centavos).toBe(100_000);
  });

  it("ano vazio não divide por zero", () => {
    const a = dreDoAno([]);
    expect(a.mesesComMovimento).toBe(0);
    expect(linhaAoLongoDoAno(a, "receita_bruta")[12]!.centavos).toBe(0);
    expect(linhaAoLongoDoAno(a, "resultado_liquido")[13]!.centavos).toBe(0);
  });

  // O ponto do módulo: média de razões não é razão de médias. A planilha
  // calcula o % do ano a partir dos valores já agregados, e nós também.
  it("o percentual do ano vem dos valores agregados, não da média dos percentuais", () => {
    // Mês 1: 25% de imposto. Mês 2: 5%. A média simples dos dois seria 15%.
    const a = dreDoAno([mes(1, 100_000, 0, -25_000), mes(2, 900_000, 0, -45_000)]);
    const pct = linhaAoLongoDoAno(a, "impostos_pct");
    expect(pct[0]!.fracao).toBeCloseTo(0.25, 6);
    expect(pct[1]!.fracao).toBeCloseTo(0.05, 6);
    // 70.000 sobre 1.000.000 = 7%, e não 15%.
    expect(pct[13]!.fracao).toBeCloseTo(0.07, 6);
    expect(pct[13]!.fracao).not.toBeCloseTo(0.15, 3);
  });

  it("os subtotais do ano fecham entre si", () => {
    const a = dreDoAno([mes(1, 500_000, -200_000, -30_000), mes(2, 400_000, -100_000, -20_000)]);
    const v = (code: string, col: number) => linhaAoLongoDoAno(a, code)[col]!.centavos!;
    for (const col of [0, 1, 12, 13]) {
      expect(v("margem_contribuicao", col)).toBe(
        v("receita_bruta", col) + v("custo_operacional", col)
      );
      expect(v("receita_liquida", col)).toBe(v("receita_bruta", col) + v("impostos", col));
    }
  });

  it("toda coluna tem todas as linhas da estrutura, na ordem", () => {
    const a = dreDoAno([mes(5, 1_000, 0)]);
    for (const c of a.colunas) {
      expect(c.linhas.map((l) => l.code)).toEqual(LINHAS.map((l) => l.code));
    }
  });

  it("linha que não existe devolve nulo em toda coluna", () => {
    const a = dreDoAno([mes(1, 1_000, 0)]);
    expect(linhaAoLongoDoAno(a, "linha_inventada")).toEqual(new Array(14).fill(null));
  });

  it("mês repetido na entrada: o último vale, sem duplicar", () => {
    const a = dreDoAno([mes(1, 100_000, 0), mes(1, 500_000, 0)]);
    // A coluna do mês usa o mapa (último ganha); a soma percorre a lista.
    expect(linhaAoLongoDoAno(a, "receita_bruta")[0]!.centavos).toBe(500_000);
    expect(a.mesesComMovimento).toBe(2);
  });
});

// As linhas da DRE do ano abrem nas categorias (13/10/2026): a mesma categoria
// nos doze meses, a média e o total, nas colunas do relatório.
describe("o detalhe das linhas no ano", () => {
  const comCategorias = (n: number, cmv: [string, number][]): MesDoAno => ({
    mes: n,
    porGrupo: { custo_operacional: cmv.reduce((s, [, c]) => s + c, 0) },
    temMovimento: true,
    porCategoria: { custo_operacional: cmv.map(([categoria, centavos]) => ({ categoria, centavos, origem: "pagamento" as const })) },
  });

  const a = dreDoAno([
    comCategorias(1, [["Frete", -1_000], ["Matéria-prima", -9_000]]),
    comCategorias(3, [["frete", -2_000]]),
  ]);

  it("uma linha por categoria, com os doze meses, a média e o ano", () => {
    const frete = a.detalhe.custo_operacional!.find((c) => c.categoria === "Frete")!;
    expect(frete.valores).toHaveLength(14);
    expect(frete.valores.slice(0, 3)).toEqual([-1_000, 0, -2_000]);
    // Média sobre os meses com movimento (dois), como a da linha.
    expect(frete.valores[12]).toBe(-1_500);
    expect(frete.valores[13]).toBe(-3_000);
  });

  it("grafias da mesma chave em meses diferentes somam na mesma linha, com o primeiro nome", () => {
    expect(a.detalhe.custo_operacional!.filter((c) => c.categoria.toLowerCase() === "frete").map((c) => c.categoria)).toEqual(["Frete"]);
  });

  // Pedido de 15/10/2026: a ordem é a alfabética, e não a do maior total.
  it("as categorias vêm em ordem alfabética, sem olhar o valor", () => {
    expect(a.detalhe.custo_operacional!.map((c) => c.categoria)).toEqual(["Frete", "Matéria-prima"]);
  });

  it("o total das categorias é o total da linha", () => {
    const anoDaLinha = linhaAoLongoDoAno(a, "custo_operacional")[13]!.centavos;
    expect(a.detalhe.custo_operacional!.reduce((s, c) => s + c.valores[13]!, 0)).toBe(anoDaLinha);
  });

  it("sem o detalhe do mês, não há o que abrir", () => {
    expect(dreDoAno([mes(1, 100_000, -40_000)]).detalhe).toEqual({});
  });
});
