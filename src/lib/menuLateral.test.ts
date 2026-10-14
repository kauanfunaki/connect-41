import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { classeDoIconButton } from "@/components/ui/IconButton";
import {
  COOKIE_DO_MENU_LATERAL,
  cookieDoMenuLateral,
  estadoDaLateral,
  LARGURA_DA_COLUNA,
  LARGURA_DA_FAIXA,
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

  // 14/10/2026: recolhido virou a faixa de ícones, com o mesmo cookie. Quem
  // recolheu antes (o valor gravado de 08 a 13/10) volta já na faixa.
  it("o cookie de antes da faixa de ícones continua valendo: recolhido abre na faixa", () => {
    const gravadoAntes = "recolhido";
    expect(cookieDoMenuLateral(true)).toContain(`${COOKIE_DO_MENU_LATERAL}=${gravadoAntes};`);
    const recolhido = menuRecolhidoDoCookie(gravadoAntes);
    expect(estadoDaLateral({ telaGrande: true, recolhido, gavetaAberta: false }).naFaixa).toBe(true);
  });
});

describe("a lateral na tela (14/10/2026)", () => {
  it("no computador, recolhida é a faixa de ícones — e continua no Tab", () => {
    expect(estadoDaLateral({ telaGrande: true, recolhido: true, gavetaAberta: false })).toEqual({ naFaixa: true, foraDoTab: false });
  });

  it("no computador, aberta é a coluna de sempre", () => {
    expect(estadoDaLateral({ telaGrande: true, recolhido: false, gavetaAberta: false })).toEqual({ naFaixa: false, foraDoTab: false });
  });

  it("abaixo do lg é a gaveta com o menu inteiro, seja qual for o cookie", () => {
    for (const recolhido of [true, false]) {
      expect(estadoDaLateral({ telaGrande: false, recolhido, gavetaAberta: true })).toEqual({ naFaixa: false, foraDoTab: false });
      // Fechada, a gaveta sai do Tab e do leitor de tela, como antes.
      expect(estadoDaLateral({ telaGrande: false, recolhido, gavetaAberta: false })).toEqual({ naFaixa: false, foraDoTab: true });
    }
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

type Regra = { classe: string; condicao: string | null; valor: string };

/** As regras de `propriedade` das classes pedidas, na ordem em que o CSS gerado as escreve. */
async function regrasDe(propriedade: "display" | "width", classes: string[]): Promise<Regra[]> {
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
  const declaracao = /\.((?:\\.|[\w-])+)\s*\{\s*(?:@media\s*\(([^)]*)\)\s*\{\s*)?([\w-]+):\s*([^;]+);/g;
  for (const m of utilitarios.matchAll(declaracao)) {
    if (m[3] === propriedade) regras.push({ classe: m[1]!.replace(/\\/g, ""), condicao: m[2] ?? null, valor: m[4]!.trim() });
  }
  return regras;
}

const regrasDeDisplay = (classes: string[]) => regrasDe("display", classes);

/** `width < 64rem`, `width >= 64rem`… vale nesta largura (em px, 1rem = 16px)? */
function valeNaLargura(condicao: string | null, largura: number): boolean {
  if (!condicao) return true;
  const m = /^width\s*(<|<=|>|>=)\s*([\d.]+)(rem|px)$/.exec(condicao.trim());
  if (!m) throw new Error(`Condição de mídia inesperada: ${condicao}`);
  const limite = Number(m[2]) * (m[3] === "rem" ? 16 : 1);
  return { "<": largura < limite, "<=": largura <= limite, ">": largura > limite, ">=": largura >= limite }[m[1] as "<" | "<=" | ">" | ">="];
}

/** O valor que fica valendo num elemento com estas classes: a última regra que se aplica vence. */
function valorFinal(regras: Regra[], classes: string[], largura: number): string | null {
  let valor: string | null = null;
  for (const r of regras) if (classes.includes(r.classe) && valeNaLargura(r.condicao, largura)) valor = r.valor;
  return valor;
}
const displayFinal = valorFinal;

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

// ─── A largura da faixa (14/10/2026) ────────────────────────────────────────
//
// O servidor não sabe a largura da tela: com o cookie de recolhido, ele desenha
// a faixa também no celular, até a hidratação trocar para o menu inteiro. A
// gaveta não pode encolher nesse meio-tempo — a faixa só vale de lg para cima.

describe("a faixa de ícones só estreita a lateral de lg para cima", () => {
  const limite = Number(/min-width:\s*(\d+)px/.exec(TELA_GRANDE)?.[1]);
  const naFaixa = [LARGURA_DA_COLUNA, LARGURA_DA_FAIXA];
  const faixa = "calc(var(--spacing) * 16)"; // 64px

  it.each([
    ["celular", 375, "240px"],
    ["janela estreita, logo abaixo do lg", limite - 1, "240px"],
    ["exatamente no lg", limite, faixa],
    ["tela cheia", 1920, faixa],
  ])("%s (%ipx): %s", async (_nome, largura, esperado) => {
    const regras = await regrasDe("width", naFaixa);
    expect(valorFinal(regras, naFaixa, largura)).toBe(esperado);
  });

  it("aberta, 240px em toda largura (a gaveta e a coluna)", async () => {
    const regras = await regrasDe("width", [LARGURA_DA_COLUNA]);
    expect(valorFinal(regras, [LARGURA_DA_COLUNA], 375)).toBe("240px");
    expect(valorFinal(regras, [LARGURA_DA_COLUNA], 1920)).toBe("240px");
  });
});
