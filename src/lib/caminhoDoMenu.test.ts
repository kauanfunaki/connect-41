import { describe, expect, it } from "vitest";
import { caminhoDoMenuAtivo, quadrosAtivo } from "./caminhoDoMenu";

describe("seleção do menu fiscal", () => {
  it("marca apenas o grupo da página de destino ao sair do painel", () => {
    const grupos = [["/sped-fiscal/motor", "/sped-fiscal/motor/operacao"], ["/sped-fiscal/motor/documentos", "/sped-fiscal/motor/classificacao"]];
    expect(grupos.map((itens) => itens.some((href) => caminhoDoMenuAtivo("/sped-fiscal/motor/documentos", href)))).toEqual([false, true]);
    expect(caminhoDoMenuAtivo("/sped-fiscal/motor", "/sped-fiscal/motor")).toBe(true);
  });

  it("mantém a seleção de detalhes sem confundir prefixos semelhantes", () => {
    expect(caminhoDoMenuAtivo("/sped-fiscal/motor/documentos/123", "/sped-fiscal/motor/documentos?aba=acervo")).toBe(true);
    expect(caminhoDoMenuAtivo("/sped-fiscal/motor/documentos-extra", "/sped-fiscal/motor/documentos")).toBe(false);
    expect(caminhoDoMenuAtivo("/gestao/horas", "/gestao")).toBe(true);
  });
});

describe("tela que é item próprio debaixo de outro item (04/11/2026)", () => {
  it("o Painel e os Órgãos acendem sozinhos; Processos segue aceso no resto", () => {
    expect(caminhoDoMenuAtivo("/processos/painel", "/processos")).toBe(false);
    expect(caminhoDoMenuAtivo("/processos/painel", "/processos/painel")).toBe(true);
    expect(caminhoDoMenuAtivo("/processos/orgaos", "/processos")).toBe(false);
    expect(caminhoDoMenuAtivo("/processos/123", "/processos")).toBe(true);
    expect(caminhoDoMenuAtivo("/processos/kanban", "/processos")).toBe(true);
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

// Lote 9 (28/10/2026): o item do DP abre as Admissões, e as abas Desligamentos
// e Férias são da mesma tela — o item fica aceso nas três.
describe("o item das Admissões acende nas abas do ciclo", () => {
  it("acende em Admissões, Desligamentos e Férias", () => {
    for (const p of ["/admissoes", "/desligamentos", "/ferias", "/ferias/abc"]) expect(caminhoDoMenuAtivo(p, "/admissoes"), p).toBe(true);
  });

  it("não acende em tela vizinha, nem as abas acendem umas às outras", () => {
    expect(caminhoDoMenuAtivo("/feriados", "/admissoes")).toBe(false);
    expect(caminhoDoMenuAtivo("/admissoes", "/ferias")).toBe(false);
  });
});
