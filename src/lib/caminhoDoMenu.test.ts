import { describe, expect, it } from "vitest";
import { caminhoDoMenuAtivo } from "./caminhoDoMenu";

describe("seleção do menu fiscal", () => {
  it("marca apenas o grupo da página de destino ao sair do painel", () => {
    const grupos = [["/fiscal", "/fiscal/operacao"], ["/fiscal/documentos", "/fiscal/classificacao"]];
    expect(grupos.map((itens) => itens.some((href) => caminhoDoMenuAtivo("/fiscal/documentos", href)))).toEqual([false, true]);
    expect(caminhoDoMenuAtivo("/fiscal", "/fiscal")).toBe(true);
  });

  it("mantém a seleção de detalhes sem confundir prefixos semelhantes", () => {
    expect(caminhoDoMenuAtivo("/fiscal/documentos/123", "/fiscal/documentos?aba=acervo")).toBe(true);
    expect(caminhoDoMenuAtivo("/fiscal/documentos-extra", "/fiscal/documentos")).toBe(false);
    expect(caminhoDoMenuAtivo("/gestao/horas", "/gestao")).toBe(true);
  });
});
