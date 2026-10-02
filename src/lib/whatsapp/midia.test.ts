import { describe, expect, it } from "vitest";
import { respondeAMidia, rotuloDaMidia, textoDaMidia } from "./midia";

describe("mídia na conversa", () => {
  it("rótulo em português, para a Evolution e para a Meta", () => {
    expect(rotuloDaMidia("audioMessage")).toBe("áudio");
    expect(rotuloDaMidia("image")).toBe("imagem");
    expect(rotuloDaMidia("stickerMessage")).toBe("figurinha");
    expect(rotuloDaMidia("algoNovoDoWhatsapp")).toBe("algoNovoDoWhatsapp");
  });

  it("a legenda entra no texto", () => {
    expect(textoDaMidia("imageMessage", "  meu certificado  ")).toBe("[imagem] meu certificado");
    expect(textoDaMidia("audioMessage")).toBe("[áudio]");
    expect(textoDaMidia("imageMessage", "   ")).toBe("[imagem]");
  });

  it("sem número visível ou mensagem vazia, não responde", () => {
    expect(respondeAMidia("imageMessage")).toBe(true);
    expect(respondeAMidia("contato sem número visível (@lid)")).toBe(false);
    expect(respondeAMidia("texto vazio")).toBe(false);
  });
});
