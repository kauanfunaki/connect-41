import { describe, expect, it } from "vitest";
import { lerSugestao, PROMPT_DO_SETOR } from "./setorSugerido";

// A sugestão do setor (12/11/2026, funcionalidade-640): só vale um código da
// lista enviada à IA; o resto vira "sem sugestão", e quem abre escolhe.
describe("sugestão do setor que vai atender", () => {
  const setores = ["tech", "rh"];
  it("aceita um setor da lista, com o motivo", () => {
    expect(lerSugestao({ sectorCode: "rh", reason: " Pedido de férias. " }, setores)).toEqual({ setor: "rh", motivo: "Pedido de férias." });
  });
  it("descarta setor fora da lista, nulo ou resposta torta", () => {
    expect(lerSugestao({ sectorCode: "fiscal", reason: "x" }, setores)).toBeNull();
    expect(lerSugestao({ sectorCode: null, reason: "não sei" }, setores)).toBeNull();
    expect(lerSugestao("rh", setores)).toBeNull();
    expect(lerSugestao(null, setores)).toBeNull();
  });
  it("o prompt trata o pedido como dado não confiável", () => {
    expect(PROMPT_DO_SETOR).toMatch(/não confiável/);
  });
});
