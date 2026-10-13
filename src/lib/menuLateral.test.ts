import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { classeDoIconButton } from "@/components/ui/IconButton";
import {
  COOKIE_DO_MENU_LATERAL,
  cookieDoMenuLateral,
  menuRecolhidoDoCookie,
  SO_NA_COLUNA,
  SO_NA_GAVETA,
  TELA_GRANDE,
} from "./menuLateral";

describe("menu lateral recolhido (08/10/2026)", () => {
  it("só o valor gravado pelo botão recolhe; sem cookie, o menu aparece", () => {
    expect(menuRecolhidoDoCookie("recolhido")).toBe(true);
    expect(menuRecolhidoDoCookie(undefined)).toBe(false);
    expect(menuRecolhidoDoCookie("")).toBe(false);
    expect(menuRecolhidoDoCookie("aberto")).toBe(false);
  });

  it("recolher grava por um ano; mostrar de novo apaga o cookie", () => {
    expect(cookieDoMenuLateral(true)).toBe(`${COOKIE_DO_MENU_LATERAL}=recolhido; path=/; max-age=31536000; samesite=lax`);
    expect(cookieDoMenuLateral(false)).toContain("max-age=0");
  });
});

// ─── Um botão de menu por vez (13/10/2026) ──────────────────────────────────
//
// Ler as classes não basta: `hidden lg:inline-flex` parecia certo e o botão
// aparecia em toda largura, porque quem decide é a ordem do CSS gerado. Aqui o
// globals.css de verdade é compilado e o `display` final de cada botão é
// conferido nas duas pontas do breakpoint.

const exigir = createRequire(import.meta.url);
const PASTA_DO_CSS = path.join(process.cwd(), "src", "app");

type Regra = { classe: string; condicao: string | null; display: string };

/** As regras de `display` das classes pedidas, na ordem em que o CSS gerado as escreve. */
async function regrasDeDisplay(classes: string[]): Promise<Regra[]> {
  const tw = await compile(readFileSync(path.join(PASTA_DO_CSS, "globals.css"), "utf8"), {
    base: PASTA_DO_CSS,
    loadStylesheet: async (id, base) => {
      const arquivo = id.startsWith(".") ? path.resolve(base, id) : exigir.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id);
      return { path: arquivo, base: path.dirname(arquivo), content: readFileSync(arquivo, "utf8") };
    },
  });
  const css = tw.build(classes);
  const utilitarios = css.slice(css.indexOf("@layer utilities"));
  const regras: Regra[] = [];
  for (const m of utilitarios.matchAll(/\.((?:\\.|[\w-])+)\s*\{\s*(?:@media\s*\(([^)]*)\)\s*\{\s*)?display:\s*([\w-]+);/g)) {
    regras.push({ classe: m[1]!.replace(/\\/g, ""), condicao: m[2] ?? null, display: m[3]! });
  }
  return regras;
}

/** `width < 64rem`, `width >= 64rem`… vale nesta largura (em px, 1rem = 16px)? */
function valeNaLargura(condicao: string | null, largura: number): boolean {
  if (!condicao) return true;
  const m = /^width\s*(<|<=|>|>=)\s*([\d.]+)(rem|px)$/.exec(condicao.trim());
  if (!m) throw new Error(`Condição de mídia inesperada: ${condicao}`);
  const limite = Number(m[2]) * (m[3] === "rem" ? 16 : 1);
  return { "<": largura < limite, "<=": largura <= limite, ">": largura > limite, ">=": largura >= limite }[m[1] as "<" | "<=" | ">" | ">="];
}

/** O `display` que fica valendo num elemento com estas classes: a última regra que se aplica vence. */
function displayFinal(regras: Regra[], classes: string[], largura: number): string | null {
  let display: string | null = null;
  for (const r of regras) if (classes.includes(r.classe) && valeNaLargura(r.condicao, largura)) display = r.display;
  return display;
}

describe("um botão de menu por vez no topo (13/10/2026)", () => {
  const base = classeDoIconButton({ size: "xl" }).split(/\s+/);
  const hamburguer = [...base, SO_NA_GAVETA, "-ml-2"];
  const recolher = [...base, SO_NA_COLUNA, "-ml-2"];
  const limite = Number(/min-width:\s*(\d+)px/.exec(TELA_GRANDE)?.[1]);

  it("a mídia do JS (gaveta inerte) e o lg do CSS mudam na mesma largura", () => {
    expect(limite).toBe(1024);
  });

  it.each([
    ["celular", 375],
    ["janela estreita, logo abaixo do lg", limite - 1],
  ])("%s: só o hambúrguer", async (_nome, largura) => {
    const regras = await regrasDeDisplay([...hamburguer, ...recolher]);
    expect(displayFinal(regras, hamburguer, largura)).toBe("inline-flex");
    expect(displayFinal(regras, recolher, largura)).toBe("none");
  });

  it.each([
    ["exatamente no lg", limite],
    ["tela cheia", 1920],
  ])("%s: só o de recolher", async (_nome, largura) => {
    const regras = await regrasDeDisplay([...hamburguer, ...recolher]);
    expect(displayFinal(regras, hamburguer, largura)).toBe("none");
    expect(displayFinal(regras, recolher, largura)).toBe("inline-flex");
  });

  it("o jeito antigo (`hidden lg:inline-flex`) deixava o de recolher em toda largura", async () => {
    const antigo = [...base, "hidden", "lg:inline-flex"];
    const regras = await regrasDeDisplay(antigo);
    expect(displayFinal(regras, ["hidden"], 375)).toBe("none"); // sozinho, esconde
    expect(displayFinal(regras, antigo, 375)).toBe("inline-flex"); // com a base do IconButton, não
  });
});
