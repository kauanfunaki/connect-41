import { describe, it, expect } from "vitest";
import { abreNaTela, rotuloDaMidia, tipoDeMidiaPelosBytes, validarMidia } from "./midia";
import { tipoDeMidiaDaMeta } from "@/lib/whatsapp/provedores/meta";
import { tipoDeMidiaDaEvolution } from "@/lib/whatsapp/provedores/evolucao";

const bytes = (cabeca: string | number[], total = 64) => {
  const b = new Uint8Array(total);
  const c = typeof cabeca === "string" ? [...cabeca].map((x) => x.charCodeAt(0)) : cabeca;
  b.set(c);
  return b;
};

describe("mídia do Atendimento", () => {
  it("reconhece o áudio do WhatsApp, MP3, MP4 e WebP pelos bytes", () => {
    expect(tipoDeMidiaPelosBytes(bytes("OggS"))?.ext).toBe("ogg");
    expect(tipoDeMidiaPelosBytes(bytes("ID3"))?.ext).toBe("mp3");
    expect(tipoDeMidiaPelosBytes(bytes([0, 0, 0, 0x18, ..."ftypisom"].map((x) => (typeof x === "string" ? x.charCodeAt(0) : x))))?.mime).toBe("video/mp4");
    expect(tipoDeMidiaPelosBytes(bytes([..."RIFF"].map((x) => x.charCodeAt(0)).concat([0, 0, 0, 0], [..."WEBP"].map((x) => x.charCodeAt(0)))))?.ext).toBe("webp");
    expect(tipoDeMidiaPelosBytes(bytes("<html>"))).toBeNull();
  });
  it("aceita PDF e imagem, recusa HTML e arquivo vazio", () => {
    expect(validarMidia("guia.pdf", bytes("%PDF-1.7")).ok).toBe(true);
    expect(validarMidia("foto.jpg", bytes([0xff, 0xd8, 0xff, 0xe0])).ok).toBe(true);
    expect(validarMidia("x.html", bytes("<html><body>")).ok).toBe(false);
    expect(validarMidia("vazio.pdf", new Uint8Array(0)).ok).toBe(false);
  });
  it("o nome do áudio ganha a extensão certa", () => {
    const r = validarMidia("audio", bytes("OggS"));
    expect(r.ok && r.nome).toBe("audio.ogg");
  });
  it("só imagem abre na tela", () => {
    expect(abreNaTela("image/png")).toBe(true);
    expect(abreNaTela("application/pdf")).toBe(false);
    expect(abreNaTela(null)).toBe(false);
  });
  it("tipo da mensagem por provedor e rótulo para a conversa", () => {
    expect(tipoDeMidiaDaMeta("image/jpeg")).toBe("image");
    expect(tipoDeMidiaDaMeta("image/webp")).toBe("document");
    expect(tipoDeMidiaDaMeta("audio/ogg")).toBe("audio");
    expect(tipoDeMidiaDaEvolution("application/pdf")).toBe("document");
    expect(rotuloDaMidia("audioMessage")).toBe("áudio");
  });
});
