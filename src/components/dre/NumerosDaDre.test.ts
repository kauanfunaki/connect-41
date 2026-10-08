import { describe, expect, it } from "vitest";
import { comparacaoComAnterior, itensDosNumerosDaDre } from "./NumerosDaDre";
import { calcularDre, montarMapeamento, type LancamentoDoDre } from "@/lib/dre/calculo";
import { MAPEAMENTO_PADRAO } from "@/lib/dre/mapeamento-padrao";
import { OUTUBRO_2025 } from "@/lib/dre/outubro-2025.fixture";
import { valorDaLinha, LINHA_DE_RESULTADO, LINHA_OPERACIONAL } from "@/lib/dre/economica";
import { moeda } from "@/lib/financeiro/formato";

const PADRAO = montarMapeamento(MAPEAMENTO_PADRAO);

describe("comparacaoComAnterior", () => {
  it("em percentual quando o mês anterior é positivo", () => {
    expect(comparacaoComAnterior(112_000, 100_000, "Set/26")).toBe("▲ 12% sobre Set/26");
    expect(comparacaoComAnterior(90_000, 100_000, "Set/26")).toBe("▼ 10% sobre Set/26");
  });

  it("em reais quando a base é zero ou negativa — percentual sobre ela não diz nada", () => {
    // O `Intl` separa "R$", "5" e "mil" com espaço que não quebra — daí o `\s`.
    expect(comparacaoComAnterior(500_000, 0, "Set/26")).toMatch(/^▲ R\$\s5\smil sobre Set\/26$/);
    // Prejuízo que diminuiu: subiu.
    expect(comparacaoComAnterior(-500_000, -1_000_000, "Set/26")).toMatch(/^▲ R\$\s5\smil sobre Set\/26$/);
  });

  it("diz quando não mudou", () => {
    expect(comparacaoComAnterior(100_000, 100_000, "Set/26")).toBe("igual a Set/26");
  });
});

describe("itensDosNumerosDaDre", () => {
  const atual = calcularDre(OUTUBRO_2025, PADRAO);

  it("usa os nomes do regime: caixa na de caixa, resultado na econômica", () => {
    expect(itensDosNumerosDaDre(atual, "caixa").map((i) => i.rotulo)).toEqual([
      "Receita bruta",
      "Margem de contribuição",
      "Gerador de caixa operacional",
      "Fluxo de caixa livre",
    ]);
    expect(itensDosNumerosDaDre(atual, "competencia").map((i) => i.rotulo)).toEqual([
      "Receita bruta",
      "Margem de contribuição",
      "Resultado operacional",
      "Resultado do período",
    ]);
  });

  it("escreve a margem só em reais, com o percentual no detalhe", () => {
    const [, margem] = itensDosNumerosDaDre(atual, "caixa");
    expect(margem.valor).toBe(moeda(valorDaLinha(atual, "margem_contribuicao")));
    expect(margem.detalhe).toMatch(/^\d+,\d% da receita$/);
  });

  it("sem mês anterior, sem comparação", () => {
    const itens = itensDosNumerosDaDre(atual, "caixa");
    expect(itens[0].detalhe).toBeUndefined();
    expect(itens[3].detalhe).toBeUndefined();
  });

  it("com mês anterior, compara receita e resultados com ele", () => {
    const metade: LancamentoDoDre[] = OUTUBRO_2025.map((l) => ({ ...l, valorCentavos: Math.round(l.valorCentavos / 2) }));
    const anterior = calcularDre(metade, PADRAO);
    const [receita, , operacional, resultado] = itensDosNumerosDaDre(atual, "caixa", { resultado: anterior, rotulo: "Set/25" });
    expect(receita.detalhe).toMatch(/^▲ (99|100|101)% sobre Set\/25$/);
    expect(operacional.detalhe).toBe(
      comparacaoComAnterior(valorDaLinha(atual, LINHA_OPERACIONAL), valorDaLinha(anterior, LINHA_OPERACIONAL), "Set/25")
    );
    expect(resultado.detalhe).toBe(
      comparacaoComAnterior(valorDaLinha(atual, LINHA_DE_RESULTADO), valorDaLinha(anterior, LINHA_DE_RESULTADO), "Set/25")
    );
  });

  it("pinta só o negativo; o zero fica cinza e o positivo neutro", () => {
    // Um mês só com o pró-labore pago: sem receita, resultado negativo.
    const soDespesa = calcularDre([{ categoria: "Pró-labore", valorCentavos: -1_100_737, origem: "pagamento" }], PADRAO);
    const [receita, , , resultado] = itensDosNumerosDaDre(soDespesa, "caixa");
    expect(receita.tom).toBe("text-fg-muted");
    expect(resultado.tom).toBe("text-danger");

    expect(itensDosNumerosDaDre(atual, "caixa")[0].tom).toBeUndefined();
  });
});
