import { describe, expect, it } from "vitest";
import { SLIDES_DA_EQUIPE } from "./slidesDaEquipe";

describe("SLIDES_DA_EQUIPE", () => {
  it("tem quatro slides, cada um com a sua chave", () => {
    expect(SLIDES_DA_EQUIPE).toHaveLength(4);
    expect(new Set(SLIDES_DA_EQUIPE.map((s) => s.chave)).size).toBe(SLIDES_DA_EQUIPE.length);
  });

  // A régua do carrossel do portal: título curto e uma frase embaixo.
  it("cada slide tem título curto e uma frase só", () => {
    for (const s of SLIDES_DA_EQUIPE) {
      expect(s.titulo.length).toBeLessThanOrEqual(36);
      expect(s.titulo).not.toMatch(/\.$/);
      expect(s.texto.length).toBeLessThanOrEqual(120);
      expect(s.texto).toMatch(/\.$/);
      expect(s.texto.slice(0, -1)).not.toMatch(/[.!?]\s/);
    }
  });

  it("fala do Connect da equipe, não do portal do cliente", () => {
    for (const s of SLIDES_DA_EQUIPE) {
      expect(`${s.titulo} ${s.texto}`).not.toMatch(/portal/i);
    }
  });
});
