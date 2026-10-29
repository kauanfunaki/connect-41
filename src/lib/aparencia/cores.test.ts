import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "@/lib/color";
import {
  AA_GRAFICO,
  AA_TEXTO,
  APARENCIA_PADRAO,
  FUNDO_CLARO,
  FUNDO_ESCURO,
  GRUPOS,
  GRUPOS_DE_COR,
  avisosDaCor,
  clarearAte,
  corCanonica,
  corDoGrupo,
  cssDaAparencia,
  escurecerAte,
  lerCoresDosGrupos,
  tonsDaCor,
  variaveisDaAparencia,
  variaveisDaMarca,
  variaveisDeFabricaDosGrupos,
} from "./cores";

function contraste(a: string, b: string) {
  return contrastRatio(relativeLuminance(a)!, relativeLuminance(b)!);
}

// As cores que alguém escolheria de fato: o azul do Connect, as do Omie, as
// do seletor de cor do app, e os extremos que quebram leitura (branco, preto,
// amarelo-limão, verde-claro, cinza médio).
const CORES = [
  "#1F5EEA", "#1A7FD6", "#F07B1D", "#8B5CF6", "#12A07A",
  "#2E6FB8", "#7C5CBF", "#1E8E5A", "#C8860D", "#0E9384", "#C5374B", "#4F46E5", "#B7791F", "#E15A2B", "#0891B2", "#586577", "#B8327A",
  "#FFFFFF", "#000000", "#FFFF00", "#FFD400", "#7BE3A1", "#808080", "#00FFFF", "#FF00FF", "#0A0A0A", "#F5F5F5",
];

const BRANCO = "#FFFFFF";
// Os fundos onde o app escreve: o claro (superfície, canvas, hover) e o
// escuro (superfície, canvas, elevado).
const FUNDOS_CLAROS = ["#FFFFFF", "#EEF3FD", FUNDO_CLARO];
const FUNDOS_ESCUROS = ["#242B3A", "#1C2230", FUNDO_ESCURO];

describe("corCanonica", () => {
  it("devolve #RRGGBB em maiúsculas", () => {
    expect(corCanonica("#1f5eea")).toBe("#1F5EEA");
    expect(corCanonica("f0a")).toBe("#FF00AA");
  });

  it("recusa o que não é cor — nada do formulário chega cru ao CSS", () => {
    expect(corCanonica("red")).toBeNull();
    expect(corCanonica("#1F5EEA;}body{display:none")).toBeNull();
    expect(corCanonica(null)).toBeNull();
    expect(corCanonica(42)).toBeNull();
  });
});

describe("escurecerAte / clarearAte", () => {
  it("não mexe na cor que já passa", () => {
    expect(escurecerAte("#1F5EEA", BRANCO, AA_TEXTO)).toBe("#1F5EEA");
    expect(clarearAte("#FFD400", "#202C46", AA_TEXTO)).toBe("#FFD400");
  });

  it("chega ao contraste pedido", () => {
    expect(contraste(escurecerAte("#FFFF00", BRANCO, AA_TEXTO), BRANCO)).toBeGreaterThanOrEqual(AA_TEXTO);
    expect(contraste(clarearAte("#000000", FUNDO_ESCURO, AA_TEXTO), FUNDO_ESCURO)).toBeGreaterThanOrEqual(AA_TEXTO);
  });

  it("escurecer preserva a matiz: o amarelo vira mostarda, não cinza", () => {
    const mostarda = escurecerAte("#FFD400", BRANCO, AA_TEXTO);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(mostarda.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b + 50);
    expect(g).toBeGreaterThan(b + 50);
  });
});

describe("tonsDaCor", () => {
  it("devolve null para o que não é cor", () => {
    expect(tonsDaCor("azul")).toBeNull();
  });

  it("garante AA em todo uso, nos dois temas, para qualquer cor", () => {
    for (const cor of CORES) {
      const t = tonsDaCor(cor)!;
      expect(contraste(t.solida, BRANCO), `${cor}: letra branca no sólido`).toBeGreaterThanOrEqual(AA_TEXTO);
      expect(contraste(t.solidaFim, BRANCO), `${cor}: letra branca no hover`).toBeGreaterThanOrEqual(AA_TEXTO);
      for (const fundo of FUNDOS_CLAROS) {
        expect(contraste(t.claro.texto, fundo), `${cor}: letra no claro sobre ${fundo}`).toBeGreaterThanOrEqual(AA_TEXTO);
        expect(contraste(t.claro.acento, fundo), `${cor}: ícone no claro sobre ${fundo}`).toBeGreaterThanOrEqual(AA_GRAFICO);
      }
      for (const fundo of FUNDOS_ESCUROS) {
        expect(contraste(t.escuro.texto, fundo), `${cor}: letra no escuro sobre ${fundo}`).toBeGreaterThanOrEqual(AA_TEXTO);
        expect(contraste(t.escuro.acento, fundo), `${cor}: ícone no escuro sobre ${fundo}`).toBeGreaterThanOrEqual(AA_GRAFICO);
      }
    }
  });

  it("o azul do Connect sai como é no claro", () => {
    const t = tonsDaCor("#1F5EEA")!;
    expect(t.solida).toBe("#1F5EEA");
    expect(t.claro.texto).toBe("#1F5EEA");
  });
});

describe("avisosDaCor", () => {
  it("cala quando a cor serve como está (fora o clareado do escuro)", () => {
    expect(avisosDaCor(tonsDaCor("#1F5EEA")!).filter((a) => !a.includes("escuro"))).toEqual([]);
  });

  it("avisa a cor clara demais para letra branca, com o tom usado", () => {
    const t = tonsDaCor("#FFD400")!;
    const avisos = avisosDaCor(t);
    expect(avisos.some((a) => a.includes("letra branca") && a.includes(t.solida))).toBe(true);
  });

  it("avisa a cor escura demais para o tema escuro", () => {
    const t = tonsDaCor("#000000")!;
    expect(avisosDaCor(t).some((a) => a.includes("tema escuro") && a.includes(t.escuro.texto))).toBe(true);
  });
});

describe("lerCoresDosGrupos", () => {
  it("fica só com os grupos conhecidos e cores válidas", () => {
    expect(lerCoresDosGrupos({ fiscal: "#ff0000", inventado: "#00ff00", financeiro: "azul" })).toEqual({ fiscal: "#FF0000" });
  });

  it("não guarda o que é igual ao padrão de fábrica", () => {
    expect(lerCoresDosGrupos({ fiscal: GRUPOS.fiscal.padrao.toLowerCase() })).toEqual({});
  });

  it("aguenta lixo do banco", () => {
    expect(lerCoresDosGrupos(null)).toEqual({});
    expect(lerCoresDosGrupos("x")).toEqual({});
    expect(lerCoresDosGrupos(["#fff"])).toEqual({});
  });
});

describe("corDoGrupo", () => {
  it("é a trocada, ou a de fábrica", () => {
    expect(corDoGrupo({ coresDosGrupos: { fiscal: "#FF0000" } }, "fiscal")).toBe("#FF0000");
    expect(corDoGrupo({ coresDosGrupos: {} }, "financeiro")).toBe(GRUPOS.financeiro.padrao);
  });

  it("os padrões de fábrica são cores distintas", () => {
    expect(new Set(GRUPOS_DE_COR.map((g) => GRUPOS[g].padrao)).size).toBe(GRUPOS_DE_COR.length);
  });
});

describe("variaveisDaMarca", () => {
  it("cobre os tokens da marca nos dois temas", () => {
    const v = variaveisDaMarca("#E15A2B")!;
    expect(Object.keys(v.comum)).toContain("--c41-brand-600");
    for (const tema of [v.claro, v.escuro]) {
      for (const token of ["--c41-brand", "--c41-brand-hover", "--c41-brand-subtle", "--c41-focus-ring", "--c41-table-header-fg", "--c41-table-header-bg"]) {
        expect(tema[token], token).toBeTruthy();
      }
    }
  });

  it("a letra do cabeçalho da tabela lê sobre o fundo dele", () => {
    for (const cor of CORES) {
      const v = variaveisDaMarca(cor)!;
      expect(contraste(v.claro["--c41-table-header-fg"], v.claro["--c41-table-header-bg"]), cor).toBeGreaterThanOrEqual(AA_TEXTO);
      expect(contraste(v.escuro["--c41-table-header-fg"], v.escuro["--c41-table-header-bg"]), cor).toBeGreaterThanOrEqual(AA_TEXTO);
    }
  });

  it("a escala fica com letra branca legível do 600 para cima", () => {
    for (const cor of CORES) {
      const v = variaveisDaMarca(cor)!;
      for (const degrau of ["600", "700", "800", "900"]) {
        expect(contraste(v.comum[`--c41-brand-${degrau}`], BRANCO), `${cor} ${degrau}`).toBeGreaterThanOrEqual(AA_TEXTO);
      }
    }
  });
});

describe("variaveisDaAparencia e cssDaAparencia", () => {
  it("sem nada escolhido, nada muda", () => {
    const v = variaveisDaAparencia(APARENCIA_PADRAO);
    expect(v).toEqual({ comum: {}, claro: {}, escuro: {} });
    expect(cssDaAparencia(v)).toBe("");
  });

  it("no Connect da equipe só vai a cor principal, nunca os grupos", () => {
    const v = variaveisDaAparencia({ ...APARENCIA_PADRAO, corPrincipal: "#E15A2B", coresDosGrupos: { fiscal: "#FF0000" } }, { grupos: false });
    const todas = Object.keys({ ...v.comum, ...v.claro, ...v.escuro });
    expect(todas.some((k) => k.startsWith("--c41-grupo"))).toBe(false);
    expect(todas).toContain("--c41-brand");
  });

  it("com as cores por grupo desligadas, todo grupo é a cor principal", () => {
    const v = variaveisDaAparencia({ ...APARENCIA_PADRAO, coresPorGrupo: false });
    for (const g of GRUPOS_DE_COR) {
      expect(v.comum[`--c41-grupo-${g}`]).toBe("var(--c41-brand)");
      expect(v.comum[`--c41-grupo-${g}-solid`]).toBe("var(--c41-brand-solid)");
    }
  });

  it("só o grupo trocado entra", () => {
    const v = variaveisDaAparencia({ ...APARENCIA_PADRAO, coresDosGrupos: { fiscal: "#FF0000" } });
    expect(Object.keys(v.claro)).toEqual(["--c41-grupo-fiscal", "--c41-grupo-fiscal-fg"]);
  });

  it("monta os blocos claro e escuro nos seletores do globals.css", () => {
    const css = cssDaAparencia(variaveisDaAparencia({ ...APARENCIA_PADRAO, corPrincipal: "#E15A2B" }));
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).toContain(':root[data-theme="dark"]{--c41-brand:');
    expect(css).not.toMatch(/[<>]/);
  });
});

describe("os padrões de fábrica no globals.css", () => {
  const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
  const fabrica = variaveisDeFabricaDosGrupos();

  // O bloco escuro principal e o do "segue o aparelho" repetem os valores.
  function valoresNoCss(nome: string): string[] {
    return [...css.matchAll(new RegExp(`${nome}:\\s*(#[0-9A-F]{6})`, "g"))].map((m) => m[1]);
  }

  it("são os que o cálculo dá — mudou um, mude os dois", () => {
    for (const [nome, valor] of Object.entries({ ...fabrica.comum, ...fabrica.claro })) {
      expect(valoresNoCss(nome)[0], nome).toBe(valor);
    }
    for (const [nome, valor] of Object.entries(fabrica.escuro)) {
      const valores = valoresNoCss(nome);
      expect(valores.slice(1), nome).toEqual([valor, valor]);
    }
  });
});
