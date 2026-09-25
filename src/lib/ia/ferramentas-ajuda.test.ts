import { describe, it, expect } from "vitest";
import { palavrasDaBusca, setoresDoEscopo, textoDoHtml, trechoEmVolta } from "./ferramentas-ajuda";

describe("ferramentas da Ajuda do Connect", () => {
  it("os setores vêm do escopo, nunca do modelo", () => {
    expect([...setoresDoEscopo({ tenantId: "t", userId: "u", escopo: { setores: "bpo, fiscal,," } })]).toEqual(["bpo", "fiscal"]);
    expect(setoresDoEscopo({ tenantId: "t", userId: "u", escopo: {} }).size).toBe(0);
  });

  it("tira o HTML do editor sem perder as quebras", () => {
    expect(textoDoHtml("<h2>Passo</h2><p>Abra &amp; confira&nbsp;o <b>extrato</b></p><script>x()</script>")).toBe(
      "Passo\nAbra & confira o extrato"
    );
  });

  it("busca por até cinco palavras de três letras ou mais", () => {
    expect(palavrasDaBusca("Como faço a Conciliação do extrato?")).toEqual(["como", "faço", "conciliação", "extrato"]);
    expect(palavrasDaBusca("a de")).toEqual([]);
  });

  it("o trecho começa perto da palavra encontrada", () => {
    const texto = `${"x ".repeat(500)}conciliação do extrato ${"y ".repeat(500)}`;
    const t = trechoEmVolta(texto, ["conciliação"], 100);
    expect(t).toContain("conciliação");
    expect(t.startsWith("…")).toBe(true);
    expect(t.endsWith("…")).toBe(true);
  });
});
