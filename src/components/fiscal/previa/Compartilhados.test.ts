import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EstadoFiscal, TabelaFiscal } from "./Compartilhados";

describe("tabelas da prévia fiscal", () => {
  it("centraliza todos os cabeçalhos, células e controles nos dois eixos", () => {
    const markup = renderToStaticMarkup(h(TabelaFiscal, {
      colunas: ["Documento", "Valor", "Ações"],
      linhas: [{ id: "teste", celulas: ["Nota de teste", "R$ 10,00", h("button", { key: "acao" }, "Conferir")] }],
    }));
    const cells = markup.match(/<(?:th|td)\b[^>]*>/g)!;
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      expect(cell).toContain("text-center");
      expect(cell).toContain("align-middle");
    }
    expect(markup.match(/flex items-center justify-center/g)).toHaveLength(3);
    expect(markup).toContain("Conferir</button>");
  });
  it.each(["Entregue · teste", "Revisão necessária", "Pendente"])("mantém a situação %s em texto sem ponto decorativo", (situacao) => {
    const markup = renderToStaticMarkup(h(EstadoFiscal, { children: situacao }));
    expect(markup).toContain(situacao);
    expect(markup).not.toContain("rounded-full");
    expect(markup.match(/<span/g)).toHaveLength(1);
  });
});
