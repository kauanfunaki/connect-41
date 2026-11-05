import { describe, expect, it } from "vitest";
import { caixaAberta, resumoDoRascunho, vazia } from "./caixaDeMensagem";

const semNada = { texto: "", arquivos: 0 };
const comTexto = { texto: "Reiniciei o spooler", arquivos: 0 };
const comArquivo = { texto: "", arquivos: 1 };

describe("caixa de resposta do chamado — abrir e recolher", () => {
  it("abre ao focar, ao anexar e ao colar um arquivo na linha recolhida", () => {
    expect(caixaAberta(false, "focar", semNada)).toBe(true);
    expect(caixaAberta(false, "anexar", semNada)).toBe(true);
    expect(caixaAberta(false, "colar-arquivo", semNada)).toBe(true);
  });
  it("Esc recolhe só a caixa vazia", () => {
    expect(caixaAberta(true, "esc", semNada)).toBe(false);
    expect(caixaAberta(true, "esc", { texto: "   \n", arquivos: 0 })).toBe(false);
    expect(caixaAberta(true, "esc", comTexto)).toBe(true);
    expect(caixaAberta(true, "esc", comArquivo)).toBe(true);
  });
  it("o botão Recolher e o envio recolhem sempre", () => {
    expect(caixaAberta(true, "recolher", comTexto)).toBe(false);
    expect(caixaAberta(true, "enviado", semNada)).toBe(false);
  });
  it("recolher não apaga o rascunho: a linha recolhida avisa o que ficou", () => {
    expect(vazia(comTexto)).toBe(false);
    expect(resumoDoRascunho(semNada)).toBe("");
    expect(resumoDoRascunho(comTexto)).toBe("Rascunho");
    expect(resumoDoRascunho(comArquivo)).toBe("Rascunho com 1 arquivo");
    expect(resumoDoRascunho({ texto: "Olá", arquivos: 3 })).toBe("Rascunho com 3 arquivos");
  });
});
