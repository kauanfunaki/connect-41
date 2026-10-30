import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "@/lib/color";
import { AA_TEXTO, FUNDO_CLARO, FUNDO_ESCURO } from "./cores";
import { PALETAS, motivoDaCorRecusada, paletaDaCor, variaveisDaPaleta } from "./paletas";

// A paleta de cada pessoa (30/10/2026).

const contraste = (a: string, b: string) => contrastRatio(relativeLuminance(a)!, relativeLuminance(b)!);

describe("paletas prontas", () => {
  it("todas passam e leem nos dois temas", () => {
    for (const p of PALETAS) {
      expect(motivoDaCorRecusada(p.cor), p.nome).toBeNull();
      const v = variaveisDaPaleta(p.cor)!;
      expect(contraste(v.claro["--c41-brand"]!, FUNDO_CLARO), p.nome).toBeGreaterThanOrEqual(AA_TEXTO);
      expect(contraste(v.escuro["--c41-brand"]!, FUNDO_ESCURO), p.nome).toBeGreaterThanOrEqual(AA_TEXTO);
    }
  });

  it("a lateral ganha só um fio da cor, nos dois temas", () => {
    const v = variaveisDaPaleta("#0B7A8A")!;
    expect(v.claro["--c41-sidebar-bg"]).toMatch(/^#[0-9A-F]{6}$/);
    expect(v.escuro["--c41-sidebar-bg"]).toMatch(/^#[0-9A-F]{6}$/);
    expect(v.claro["--c41-sidebar-bg"]).not.toBe("#FFFFFF");
  });

  it("reconhece a pronta pela cor, e a própria fica sem nome", () => {
    expect(paletaDaCor("#0b7a8a")?.nome).toBe("Oceano");
    expect(paletaDaCor("#123456")).toBeNull();
    expect(paletaDaCor(null)).toBeNull();
  });
});

describe("cor própria", () => {
  it("recusa a que não daria destaque", () => {
    expect(motivoDaCorRecusada("#FFFFFF")).toMatch(/branca/);
    expect(motivoDaCorRecusada("#050505")).toMatch(/preta/);
    expect(motivoDaCorRecusada("#808080")).toMatch(/cinza/);
    expect(motivoDaCorRecusada("vermelho")).toBe("Cor inválida.");
  });

  it("aceita uma cor viva qualquer", () => {
    expect(motivoDaCorRecusada("#E91E63")).toBeNull();
    expect(motivoDaCorRecusada("#FFC107")).toBeNull();
  });
});
