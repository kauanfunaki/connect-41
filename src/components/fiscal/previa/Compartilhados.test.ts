import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/(app)/fiscal/local-actions", () => ({ agirNoFiscalLocal: vi.fn() }));
import { EstadoFiscal, TabelaFiscal } from "./Compartilhados";

describe("tabelas da prévia fiscal", () => {
  // Texto à esquerda, valores à direita (26/10/2026); antes tudo centralizado.
  it("alinha texto à esquerda e valores à direita, no meio da linha", () => {
    const markup = renderToStaticMarkup(h(TabelaFiscal, {
      colunas: ["Documento", "Valor", "Ações"],
      linhas: [{ id: "teste", celulas: ["Nota de teste", "R$ 10,00", h("button", { key: "acao" }, "Conferir")] }],
    }));
    const cells = markup.match(/<(?:th|td)\b[^>]*>/g)!;
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      expect(cell).toContain("align-middle");
      expect(cell).not.toContain("text-center");
    }
    expect(cells.map((c) => c.includes("text-right") ? "direita" : "esquerda")).toEqual(["esquerda", "direita", "esquerda", "esquerda", "direita", "esquerda"]);
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
