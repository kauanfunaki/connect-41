import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/(app)/fiscal/local-actions", () => ({ agirNoFiscalLocal: vi.fn() }));
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
  // A situação no Selo do Connect (15/10/2026), e não em texto colorido solto.
  it.each([
    ["Entregue · teste", "text-success-fg"],
    ["Revisão necessária", "text-warning-fg"],
    ["Erro", "text-danger"],
    ["Na fila", "text-brand"],
    ["Pendente", "text-fg-muted"],
  ])("mostra a situação %s no Selo, sem ponto decorativo", (situacao, cor) => {
    const markup = renderToStaticMarkup(h(EstadoFiscal, { children: situacao }));
    expect(markup).toContain(situacao);
    expect(markup).toContain("rounded-full");
    expect(markup).toContain(cor);
    expect(markup.match(/<span/g)).toHaveLength(1);
  });
});
