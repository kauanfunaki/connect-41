import { describe, expect, it } from "vitest";
import { ASSUNTO_SOB_MEDIDA, alternarSetor, linkDoSobMedida, resumoDaEscolha, rotulosEscolhidos } from "./sobMedida";
import { setoresDoSobMedida } from "./site-regras";

// O cartão "Connect sob medida" do site (14/10/2026): as etiquetas escolhidas
// viram a lista do corpo do e-mail; sem escolha (ou sem JavaScript), só o
// assunto.

const CONTATO = "marcos@41contabil.com.br";

/** O assunto e o corpo do link, já decodificados. */
function lerLink(link: string) {
  const [destino, busca = ""] = link.split("?");
  const partes = Object.fromEntries(busca.split("&").map((p) => p.split("=") as [string, string]));
  return {
    destino,
    assunto: partes.subject === undefined ? undefined : decodeURIComponent(partes.subject),
    corpo: partes.body === undefined ? undefined : decodeURIComponent(partes.body),
    cru: busca,
  };
}

describe("linkDoSobMedida", () => {
  it("sem setor escolhido: o e-mail do site com o assunto, sem corpo — o mesmo link de quem abre sem JavaScript", () => {
    const link = linkDoSobMedida(CONTATO, []);
    expect(link).toBe("mailto:marcos@41contabil.com.br?subject=Connect%20sob%20medida");
    expect(lerLink(link).assunto).toBe(ASSUNTO_SOB_MEDIDA);
  });

  it("com setores: a lista no corpo, um por linha, com a quebra de linha do e-mail (CRLF)", () => {
    const link = linkDoSobMedida(CONTATO, ["BPO", "Societário"]);
    const { destino, assunto, corpo, cru } = lerLink(link);
    expect(destino).toBe(`mailto:${CONTATO}`);
    expect(assunto).toBe("Connect sob medida");
    expect(corpo).toBe(
      "Olá! Quero montar o Connect sob medida para o meu escritório.\r\n\r\nOs setores que me interessam:\r\n- BPO\r\n- Societário\r\n",
    );
    // Nada cru no link: acento, espaço e quebra de linha codificados.
    expect(cru).toContain("%0D%0A");
    expect(cru).not.toMatch(/[\s\r\nçáéíóúãõ]/);
  });

  it("um setor só: a frase no singular", () => {
    expect(lerLink(linkDoSobMedida(CONTATO, ["Fiscal"])).corpo).toContain("O setor que me interessa:\r\n- Fiscal");
  });
});

describe("a escolha das etiquetas", () => {
  const SETORES = [
    { code: "bpo", rotulo: "BPO" },
    { code: "dp", rotulo: "DP" },
    { code: "fiscal", rotulo: "Fiscal" },
  ];

  it("liga e desliga sem mexer no conjunto de antes", () => {
    const antes = new Set<string>();
    const um = alternarSetor(antes, "fiscal");
    expect([...um]).toEqual(["fiscal"]);
    expect(antes.size).toBe(0);
    expect([...alternarSetor(um, "fiscal")]).toEqual([]);
  });

  it("os nomes saem na ordem das etiquetas, não na dos cliques", () => {
    const escolhidos = alternarSetor(alternarSetor(new Set(), "fiscal"), "bpo");
    expect(rotulosEscolhidos(SETORES, escolhidos)).toEqual(["BPO", "Fiscal"]);
    expect(rotulosEscolhidos(SETORES, new Set(["fora-do-catalogo"]))).toEqual([]);
  });

  it("a frase embaixo das etiquetas", () => {
    expect(resumoDaEscolha(0)).toBe("");
    expect(resumoDaEscolha(1)).toBe("1 setor escolhido, que vai junto no e-mail.");
    expect(resumoDaEscolha(3)).toBe("3 setores escolhidos, que vão junto no e-mail.");
  });
});

describe("setoresDoSobMedida", () => {
  it("todo setor do catálogo que tem módulo, na ordem das etiquetas dos planos", () => {
    const catalogo = [
      { code: "a", sectorCode: "fiscal" },
      { code: "b", sectorCode: "bpo" },
      { code: "c", sectorCode: "bpo" },
      { code: "d", sectorCode: "societario" },
    ] as unknown as Parameters<typeof setoresDoSobMedida>[0];
    expect(setoresDoSobMedida(catalogo).map((s) => s.code)).toEqual(["bpo", "fiscal", "societario"]);
    expect(Object.keys(setoresDoSobMedida(catalogo)[0]!).sort()).toEqual(["code", "cor", "rotulo"]);
  });

  it("no catálogo de verdade, um setor por etiqueta, sem repetir", () => {
    const codigos = setoresDoSobMedida().map((s) => s.code);
    expect(codigos.length).toBeGreaterThan(3);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});
