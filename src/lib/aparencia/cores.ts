// As cores do escritório (21/10/2026): a cor principal que o portal dos
// clientes usa no lugar do azul do Connect, e uma cor por grupo de telas do
// portal — no jeito do Omie, que separa azul para contas a pagar e receber e
// laranja para a emissão de nota (pedido do Kauan de 15/10, estudado em 20/10).
//
// Tudo aqui é cálculo puro: a mesma conta monta o <style> do portal
// (`EstiloDaAparencia`), a prévia do admin e os padrões de fábrica do
// globals.css — o teste confere que os três não se desencontram.
//
// A regra é a do resto do app: texto pequeno com 4,5:1 (WCAG AA) nos dois
// temas, e elemento gráfico (ícone, traço, filete) com 3:1. A cor escolhida
// nunca é recusada: o tom é ajustado até passar, na mesma matiz, e o admin
// mostra o tom que ficou (ver `avisosDaCor`).

import { contrastRatio, parseHexColor, relativeLuminance, toHex, type Rgb } from "@/lib/color";

// ─── Os grupos ───────────────────────────────────────────────────────────────

export const GRUPOS_DE_COR = ["financeiro", "fiscal", "processos", "atendimento"] as const;
export type GrupoDeCor = (typeof GRUPOS_DE_COR)[number];

/**
 * Os grupos e o padrão de fábrica de cada um. Azul e laranja são os do Omie;
 * roxo e verde fecham quatro matizes bem separadas entre si e do azul do
 * Connect, para nenhum grupo parecer o item ativo do menu.
 */
export const GRUPOS: Record<GrupoDeCor, { rotulo: string; telas: string; padrao: string }> = {
  financeiro: {
    rotulo: "Financeiro",
    telas: "Contas a pagar e a receber, lançamentos, conciliação, cobrança, fluxo de caixa, DRE e aprovações.",
    padrao: "#1A7FD6",
  },
  fiscal: { rotulo: "Fiscal e notas", telas: "As notas emitidas e recebidas, a emissão de NFS-e e as telas do Fiscal.", padrao: "#F07B1D" },
  processos: { rotulo: "Processos", telas: "Processos societários, licenças e exigências.", padrao: "#8B5CF6" },
  atendimento: {
    rotulo: "Solicitações",
    telas: "Solicitações, pendências, comunicados, documentos do escritório, arquivos e conversas.",
    padrao: "#12A07A",
  },
};

export function ehGrupoDeCor(valor: unknown): valor is GrupoDeCor {
  return typeof valor === "string" && (GRUPOS_DE_COR as readonly string[]).includes(valor);
}

// ─── O ajuste de tom ─────────────────────────────────────────────────────────

/** "#rgb", "#rrggbb" ou sem "#" → "#RRGGBB"; `null` se não for cor. */
export function corCanonica(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const rgb = parseHexColor(valor);
  return rgb ? toHex(rgb) : null;
}

function contraste(a: string, b: string): number {
  return contrastRatio(relativeLuminance(a)!, relativeLuminance(b)!);
}

function multiplicar({ r, g, b }: Rgb, fator: number): Rgb {
  return { r: r * fator, g: g * fator, b: b * fator };
}

/** Mistura `a` com `b`; `peso` é quanto de `b` entra (0 a 1). */
export function misturar(a: string, b: string, peso: number): string {
  const x = parseHexColor(a)!;
  const y = parseHexColor(b)!;
  return toHex({ r: x.r + (y.r - x.r) * peso, g: x.g + (y.g - x.g) * peso, b: x.b + (y.b - x.b) * peso });
}

/** Escurece por fator (multiplica os canais, preserva a matiz). */
export function escurecer(cor: string, fator: number): string {
  return toHex(multiplicar(parseHexColor(cor)!, fator));
}

/**
 * Escurece até ter `minimo` de contraste sobre `fundo` (um fundo claro).
 * Multiplica os canais em passos de 3%: um amarelo vira mostarda, não cinza.
 * Devolve a própria cor quando ela já passa.
 */
export function escurecerAte(cor: string, fundo: string, minimo: number): string {
  let atual = parseHexColor(cor)!;
  for (let passo = 0; passo < 120 && contraste(toHex(atual), fundo) < minimo; passo += 1) atual = multiplicar(atual, 0.97);
  return toHex(atual);
}

/**
 * Clareia até ter `minimo` de contraste sobre `fundo` (um fundo escuro).
 * Mistura com branco — multiplicar nunca tira o preto do lugar.
 */
export function clarearAte(cor: string, fundo: string, minimo: number): string {
  let atual = cor;
  for (let passo = 0; passo < 120 && contraste(atual, fundo) < minimo; passo += 1) atual = misturar(atual, BRANCO, 0.04);
  return atual;
}

// Os fundos de referência: o mais escuro dos claros e o mais claro dos
// escuros, onde o texto colorido pior se lê. No claro, o `--c41-surface-hover`
// (#E6EDFB, o hover das linhas e do menu); no escuro, o `--c41-surface-elevated`
// (#202C46, o painel flutuante). Quem passa neles passa no canvas, na
// superfície e nos cartões.
export const FUNDO_CLARO = "#E6EDFB";
export const FUNDO_ESCURO = "#202C46";
const BRANCO = "#FFFFFF";
// A superfície do escuro, sob o cabeçalho de tabela tingido.
const SUPERFICIE_ESCURA = "#141D30";

export const AA_TEXTO = 4.5;
export const AA_GRAFICO = 3;

/** Os tons de uma cor para cada uso, já com o contraste garantido. */
export type TonsDaCor = {
  base: string;
  /** Fundo com letra branca: botão, item ativo do menu, cartão do número. */
  solida: string;
  /** O hover do sólido, um degrau mais fechado. */
  solidaFim: string;
  claro: { texto: string; acento: string };
  escuro: { texto: string; acento: string };
};

/** Os tons de uma cor. `null` se não for cor. */
export function tonsDaCor(valor: string): TonsDaCor | null {
  const base = corCanonica(valor);
  if (!base) return null;
  const solida = escurecerAte(base, BRANCO, AA_TEXTO);
  return {
    base,
    solida,
    solidaFim: escurecer(solida, 0.86),
    claro: { texto: escurecerAte(base, FUNDO_CLARO, AA_TEXTO), acento: escurecerAte(base, FUNDO_CLARO, AA_GRAFICO) },
    escuro: { texto: clarearAte(base, FUNDO_ESCURO, AA_TEXTO), acento: clarearAte(base, FUNDO_ESCURO, AA_GRAFICO) },
  };
}

/**
 * O que o admin avisa quando o tom precisou de ajuste. A cor da prévia já é a
 * ajustada; o aviso diz por quê, para ninguém achar que a escolha "não pegou".
 */
export function avisosDaCor(tons: TonsDaCor): string[] {
  const avisos: string[] = [];
  if (tons.solida !== tons.base) {
    avisos.push(`Clara demais para letra branca: nos botões e no item aberto do menu ela fica em ${tons.solida}.`);
  }
  if (tons.claro.texto !== tons.base && tons.solida === tons.base) {
    avisos.push(`Como letra no tema claro, ela fica em ${tons.claro.texto}, para ler bem nos fundos azulados.`);
  }
  if (tons.escuro.texto !== tons.base) {
    avisos.push(`No tema escuro ela fica mais clara, em ${tons.escuro.texto}, para ler bem no fundo escuro.`);
  }
  return avisos;
}

// ─── A aparência do escritório ───────────────────────────────────────────────

export type Aparencia = {
  /** A cor principal do portal; `null` = o azul do Connect. */
  corPrincipal: string | null;
  /** Só os grupos trocados; o resto fica no padrão de fábrica. */
  coresDosGrupos: Partial<Record<GrupoDeCor, string>>;
  /** Desligado, todo grupo usa a cor principal (o portal de antes). */
  coresPorGrupo: boolean;
  /** O logo do escritório no lugar do logo do Connect, no menu do portal. */
  logoNoPortal: boolean;
  /** A cor principal também no Connect da equipe. Desligado por padrão. */
  noConnect: boolean;
};

export const APARENCIA_PADRAO: Aparencia = {
  corPrincipal: null,
  coresDosGrupos: {},
  coresPorGrupo: true,
  logoNoPortal: false,
  noConnect: false,
};

/** Os grupos trocados de um JSON do banco (ou do formulário), sem lixo. */
export function lerCoresDosGrupos(valor: unknown): Partial<Record<GrupoDeCor, string>> {
  const cores: Partial<Record<GrupoDeCor, string>> = {};
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return cores;
  for (const [grupo, cor] of Object.entries(valor)) {
    const canonica = corCanonica(cor);
    // Igual ao padrão não é troca: não guarda, para um padrão novo de fábrica chegar.
    if (ehGrupoDeCor(grupo) && canonica && canonica !== GRUPOS[grupo].padrao) cores[grupo] = canonica;
  }
  return cores;
}

/** A cor de um grupo: a trocada pelo escritório, ou a de fábrica. */
export function corDoGrupo(aparencia: Pick<Aparencia, "coresDosGrupos">, grupo: GrupoDeCor): string {
  return aparencia.coresDosGrupos[grupo] ?? GRUPOS[grupo].padrao;
}

// ─── As variáveis de CSS ─────────────────────────────────────────────────────

export type Variaveis = Record<string, string>;
/** `comum` vale nos dois temas; `claro` e `escuro`, em cada um. */
export type VariaveisPorTema = { comum: Variaveis; claro: Variaveis; escuro: Variaveis };

function semTransparencia(cor: string, porcento: number): string {
  return `color-mix(in srgb, ${cor} ${porcento}%, transparent)`;
}

/**
 * A cor principal do escritório nos tokens da marca (`--c41-brand-*`). Os
 * tokens são os mesmos que o azul do Connect ocupa — botão, item ativo, link,
 * foco, cabeçalho de tabela, cartão do número, gráficos —, então nenhum
 * componente muda: muda o valor.
 *
 * A escala 50–900 nasce do tom sólido, que é o 600 (o degrau do azul 41).
 */
export function variaveisDaMarca(valor: string): VariaveisPorTema | null {
  const tons = tonsDaCor(valor);
  if (!tons) return null;
  const { solida } = tons;

  const cabecalhoClaro = misturar(BRANCO, solida, 0.09);
  const letraDoCabecalhoClaro = escurecerAte(tons.claro.texto, cabecalhoClaro, AA_TEXTO);
  const cabecalhoEscuro = misturar(SUPERFICIE_ESCURA, tons.escuro.texto, 0.06);
  const letraDoCabecalhoEscuro = clarearAte(tons.escuro.texto, cabecalhoEscuro, AA_TEXTO);

  return {
    comum: {
      "--c41-brand-50": misturar(solida, BRANCO, 0.93),
      "--c41-brand-100": misturar(solida, BRANCO, 0.85),
      "--c41-brand-200": misturar(solida, BRANCO, 0.7),
      "--c41-brand-300": misturar(solida, BRANCO, 0.5),
      "--c41-brand-400": misturar(solida, BRANCO, 0.32),
      "--c41-brand-500": misturar(solida, BRANCO, 0.15),
      "--c41-brand-600": solida,
      "--c41-brand-700": tons.solidaFim,
      "--c41-brand-800": escurecer(solida, 0.74),
      "--c41-brand-900": escurecer(solida, 0.62),
    },
    claro: {
      "--c41-brand": tons.claro.texto,
      "--c41-brand-hover": escurecer(tons.claro.texto, 0.86),
      "--c41-brand-subtle": semTransparencia(solida, 10),
      "--c41-focus-ring": semTransparencia(solida, 35),
      "--c41-selected-bg": semTransparencia(solida, 10),
      "--c41-glow": semTransparencia(solida, 16),
      "--c41-table-header-bg": cabecalhoClaro,
      "--c41-table-header-fg": letraDoCabecalhoClaro,
      "--c41-table-header-divider": semTransparencia(letraDoCabecalhoClaro, 30),
    },
    escuro: {
      "--c41-brand": tons.escuro.texto,
      "--c41-brand-hover": misturar(tons.escuro.texto, BRANCO, 0.3),
      "--c41-brand-subtle": semTransparencia(tons.escuro.texto, 18),
      "--c41-focus-ring": semTransparencia(tons.escuro.acento, 45),
      "--c41-selected-bg": semTransparencia(solida, 22),
      "--c41-glow": semTransparencia(tons.escuro.texto, 22),
      "--c41-table-header-bg": cabecalhoEscuro,
      "--c41-table-header-fg": letraDoCabecalhoEscuro,
      "--c41-table-header-divider": semTransparencia(letraDoCabecalhoEscuro, 24),
    },
  };
}

/** As três variáveis de um grupo em cada tema: acento (3:1), letra (4,5:1) e sólido (letra branca). */
export function variaveisDoGrupo(grupo: GrupoDeCor, cor: string): VariaveisPorTema {
  const tons = tonsDaCor(cor) ?? tonsDaCor(GRUPOS[grupo].padrao)!;
  return {
    comum: { [`--c41-grupo-${grupo}-solid`]: tons.solida, [`--c41-grupo-${grupo}-solid-fim`]: tons.solidaFim },
    claro: { [`--c41-grupo-${grupo}`]: tons.claro.acento, [`--c41-grupo-${grupo}-fg`]: tons.claro.texto },
    escuro: { [`--c41-grupo-${grupo}`]: tons.escuro.acento, [`--c41-grupo-${grupo}-fg`]: tons.escuro.texto },
  };
}

/** Com as cores por grupo desligadas, cada grupo é a cor principal. */
function gruposNaCorPrincipal(): Variaveis {
  const v: Variaveis = {};
  for (const g of GRUPOS_DE_COR) {
    v[`--c41-grupo-${g}`] = "var(--c41-brand)";
    v[`--c41-grupo-${g}-fg`] = "var(--c41-brand)";
    v[`--c41-grupo-${g}-solid`] = "var(--c41-brand-solid)";
    v[`--c41-grupo-${g}-solid-fim`] = "var(--c41-brand-solid-hover)";
  }
  return v;
}

function juntar(...partes: (VariaveisPorTema | null)[]): VariaveisPorTema {
  const total: VariaveisPorTema = { comum: {}, claro: {}, escuro: {} };
  for (const p of partes) {
    if (!p) continue;
    Object.assign(total.comum, p.comum);
    Object.assign(total.claro, p.claro);
    Object.assign(total.escuro, p.escuro);
  }
  return total;
}

/**
 * As variáveis que a aparência do escritório troca. Só o que difere da
 * fábrica: sem nada escolhido, sai vazio e o portal fica exatamente como era.
 * `grupos: false` é o Connect da equipe, que só leva a cor principal.
 */
export function variaveisDaAparencia(aparencia: Aparencia, { grupos = true }: { grupos?: boolean } = {}): VariaveisPorTema {
  const marca = aparencia.corPrincipal ? variaveisDaMarca(aparencia.corPrincipal) : null;
  if (!grupos) return juntar(marca);
  if (!aparencia.coresPorGrupo) return juntar(marca, { comum: gruposNaCorPrincipal(), claro: {}, escuro: {} });
  const trocados = GRUPOS_DE_COR.filter((g) => aparencia.coresDosGrupos[g]).map((g) => variaveisDoGrupo(g, aparencia.coresDosGrupos[g]!));
  return juntar(marca, ...trocados);
}

/** Os padrões de fábrica dos grupos — os mesmos valores escritos no globals.css. */
export function variaveisDeFabricaDosGrupos(): VariaveisPorTema {
  return juntar(...GRUPOS_DE_COR.map((g) => variaveisDoGrupo(g, GRUPOS[g].padrao)));
}

function bloco(seletor: string, v: Variaveis): string {
  const linhas = Object.entries(v).map(([k, valor]) => `${k}:${valor};`);
  return linhas.length ? `${seletor}{${linhas.join("")}}` : "";
}

/**
 * O CSS da aparência, nos mesmos seletores do globals.css (e depois dele na
 * página, então ganha com a mesma especificidade). Vazio quando não há nada
 * trocado. Só sai daqui o que `tonsDaCor` montou — hex de 6 dígitos e
 * `color-mix`/`var` escritos por este arquivo —, então nada do banco chega
 * cru ao <style>.
 */
export function cssDaAparencia(v: VariaveisPorTema): string {
  return [
    bloco(":root", { ...v.comum, ...v.claro }),
    bloco(':root[data-theme="dark"]', v.escuro),
    Object.keys(v.escuro).length
      ? `@media (prefers-color-scheme: dark){${bloco(':root:not([data-theme="light"]):not([data-theme="dark"])', v.escuro)}}`
      : "",
  ].join("");
}
