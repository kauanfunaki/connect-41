import { describe, expect, it } from "vitest";
import { caminhoDoMenuAtivo, quadrosAtivo } from "./caminhoDoMenu";

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

describe("quadrosAtivo", () => {
  it("acende na raiz, nos espaços, nas pastas e nas listas", () => {
    for (const p of ["/setor/bpo", "/setor/bpo/espacos/e1", "/setor/bpo/pastas/p1", "/kanban/l1", "/kanban/l1/itens/x"]) expect(quadrosAtivo(p, "bpo")).toBe(true);
  });

  it("não acende nas telas do setor que moram debaixo do mesmo endereço", () => {
    for (const p of ["/setor/bpo/grupo/cadastros", "/setor/bpo/telas", "/setor/bpo/bpo_cadastros", "/setor/bpo-outro", "/setor/dp"]) expect(quadrosAtivo(p, "bpo")).toBe(false);
  });
});
