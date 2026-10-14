import { describe, expect, it } from "vitest";
import { MAX_ORIGEM, ORIGENS, limparOrigem, origemParaGravar, rotuloDaOrigem } from "./origem";

describe("origem da candidatura", () => {
  it("as opções do painel, na ordem da tela", () => {
    expect(ORIGENS.map((o) => o.rotulo)).toEqual(["Indicação", "Portal", "WhatsApp", "LinkedIn", "Outra…"]);
  });

  it("cada opção grava no campo de texto de sempre; Portal com o código da inscrição pelo portal", () => {
    expect(origemParaGravar("INDICACAO", "")).toBe("Indicação");
    expect(origemParaGravar("PORTAL", "")).toBe("PORTAL");
    expect(origemParaGravar("WHATSAPP", "")).toBe("WhatsApp");
    expect(origemParaGravar("LINKEDIN", "ignorado")).toBe("LinkedIn");
  });

  it("Outra grava o texto escrito; sem escolha ou sem texto, nada", () => {
    expect(origemParaGravar("OUTRA", "  feira   de empregos ")).toBe("feira de empregos");
    expect(origemParaGravar("OUTRA", "   ")).toBeNull();
    expect(origemParaGravar(null, "qualquer")).toBeNull();
    expect(origemParaGravar("OUTRA", "x".repeat(200))).toHaveLength(MAX_ORIGEM);
  });

  it("a action limpa o que chega do navegador", () => {
    expect(limparOrigem(" Indeed ")).toBe("Indeed");
    expect(limparOrigem("")).toBeNull();
    expect(limparOrigem(undefined)).toBeNull();
    expect(limparOrigem(42)).toBeNull();
    expect(limparOrigem("y".repeat(120))).toHaveLength(MAX_ORIGEM);
  });

  it("no cartão, o código do portal ganha nome", () => {
    expect(rotuloDaOrigem("PORTAL")).toBe("Portal de vagas");
    expect(rotuloDaOrigem("LinkedIn")).toBe("LinkedIn");
  });
});
