import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calcularDre, montarMapeamento, type LancamentoDoDre } from "@/lib/dre/calculo";
import { MAPEAMENTO_PADRAO } from "@/lib/dre/mapeamento-padrao";
import { dreDoAno } from "@/lib/dre/anual";
import { TabelaDaDre } from "./TabelaDaDre";
import { RelatorioAnual } from "./RelatorioAnual";

// As linhas da DRE que abrem nas categorias (13/10/2026). Sem navegador, o
// HTML do servidor: a linha de grupo com categorias é um botão com
// `aria-expanded`, que começa fechado — sem as categorias na tabela —, e a
// linha sem nada para abrir continua texto.

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const l = (categoria: string, reais: number, origem: "recebimento" | "pagamento"): LancamentoDoDre => ({
  categoria,
  valorCentavos: Math.round(reais * 100),
  origem,
});

const resultado = calcularDre(
  [l("Clientes - Venda de Mercadoria Fabricadas", 1000, "recebimento"), l("Frete", -100, "pagamento"), l("Compra de Matéria Prima - Bobina", -300, "pagamento")],
  montarMapeamento(MAPEAMENTO_PADRAO)
);

describe("a DRE do mês (equipe e portal)", () => {
  const html = renderToStaticMarkup(React.createElement(TabelaDaDre, { linhas: resultado.linhas, detalhe: resultado.porCategoria }));

  it("a linha de grupo com categorias é um botão fechado", () => {
    expect(html).toMatch(/<button type="button" aria-expanded="false"[^>]*>[\s\S]*?CMV SOBRE RECEITA BRUTA/);
    expect(html).toContain("(2 categorias)");
  });

  it("fechada, as categorias não estão na tabela", () => {
    expect(html).not.toContain("Compra de Matéria Prima - Bobina");
  });

  it("linha de grupo zerada não abre, e subtotal não é botão", () => {
    const botoes = html.match(/aria-expanded/g) ?? [];
    expect(botoes).toHaveLength(2); // receita bruta e CMV
    expect(html).not.toMatch(/<button[^>]*>[\s\S]{0,200}MARGEM DE CONTRIBUIÇÃO<\/span>/);
  });
});

describe("a DRE do ano", () => {
  const anual = dreDoAno([{ mes: 2, porGrupo: resultado.porGrupo, temMovimento: true, porCategoria: resultado.porCategoria }]);
  const html = renderToStaticMarkup(React.createElement(RelatorioAnual, { anual }));

  it("usa o mesmo botão, fechado", () => {
    expect(html).toMatch(/<button type="button" aria-expanded="false"[^>]*>[\s\S]*?CMV SOBRE RECEITA BRUTA/);
    expect(html).not.toContain("Compra de Matéria Prima - Bobina");
  });
});

describe("sem detalhe nenhum (o acumulado da DRE econômica)", () => {
  it("nenhuma linha abre, e os rótulos ficam sem o recuo da seta", () => {
    const html = renderToStaticMarkup(React.createElement(TabelaDaDre, { linhas: resultado.linhas, detalhe: {} }));
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("pl-[18px]");
  });
});
