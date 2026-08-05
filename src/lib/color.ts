// Utilitários de cor para fundos definidos pelo usuário (cor de estágio de
// pipeline, cor de tag). Essas cores vêm do banco e não passam pelos tokens do
// tema, então o texto por cima delas precisa ser escolhido por cálculo — não dá
// pra usar `text-fg`, que inverte junto com o tema e some em metade dos casos.

export type Rgb = { r: number; g: number; b: number };

/** Aceita `#RGB`, `#RRGGBB` (com ou sem `#`). Devolve null pra qualquer outra coisa. */
export function parseHexColor(value: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;

  const hex = match[1].length === 3
    ? match[1].split("").map((c) => c + c).join("")
    : match[1];

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa da WCAG 2.1 (0 = preto, 1 = branco). Null se não for hex. */
export function relativeLuminance(value: string): number | null {
  const rgb = parseHexColor(value);
  if (!rgb) return null;
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

// Texto quase-preto em vez de `#000`: sobre um fundo saturado (amarelo, verde
// claro) o preto puro vibra; este tom é o mesmo pé da escala neutra do app.
const DARK_TEXT = "#16181D";
const LIGHT_TEXT = "#FFFFFF";

/** Razão de contraste da WCAG entre duas luminâncias relativas (1 a 21). */
export function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// Margem que o texto escuro precisa vencer pra ser escolhido. Nas cores
// médias-saturadas (laranja queimado, verde-oliva) os dois lados chegam quase
// empatados, e aí a escolha é estética, não de acessibilidade — a convenção,
// no ClickUp e em todo badge de status, é texto branco. Só quando o fundo é de
// fato claro (amarelo, verde-claro) o escuro abre folga e assume.
const DARK_TEXT_MARGIN = 1.1;

/**
 * Cor de texto legível sobre um fundo sólido arbitrário.
 *
 * Compara o contraste real contra os dois tons de texto do app em vez de usar
 * um limiar fixo de luminância — o texto escuro não é preto puro, então o
 * ponto de virada teórico (0.179) não vale pra ele.
 *
 * Entradas que não são hex (`var(--…)`, `oklch(…)`) não têm luminância
 * conhecida aqui: devolve o texto claro, que é o caso das cores de estágio
 * padrão do app (todas escuras o bastante).
 */
export function readableTextOn(background: string): string {
  const luminance = relativeLuminance(background);
  if (luminance === null) return LIGHT_TEXT;

  const onLight = contrastRatio(luminance, relativeLuminance(LIGHT_TEXT)!);
  const onDark = contrastRatio(luminance, relativeLuminance(DARK_TEXT)!);

  return onDark > onLight * DARK_TEXT_MARGIN ? DARK_TEXT : LIGHT_TEXT;
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Contraste de um fundo contra o texto branco. */
export function contrastWithWhite(background: string): number | null {
  const luminance = relativeLuminance(background);
  if (luminance === null) return null;
  return contrastRatio(luminance, 1);
}

// Piso da WCAG AA para texto normal.
const MIN_CONTRAST = 4.5;

/**
 * Escurece um fundo até o texto BRANCO ter contraste suficiente por cima dele.
 *
 * Existe porque badge de status é um caso onde a cor não pode ditar a cor da
 * fonte: alternar entre texto claro e escuro conforme o status deixava a lista
 * visualmente remendada (um "A FAZER" cinza e um "AGUARDANDO CLIENTE" âmbar
 * ficavam com letra preta no meio de vizinhos de letra branca). Fixar o branco
 * e ajustar o fundo dá um conjunto uniforme — e a cor escolhida pelo usuário
 * continua reconhecível, só num tom mais fechado.
 *
 * Escurece multiplicando os canais, o que preserva a matiz (um amarelo vira
 * mostarda, não cinza). Devolve a cor original quando ela já passa, e quando a
 * entrada não é hex (não há o que calcular).
 */
export function darkenUntilReadableOnWhiteText(background: string): string {
  const rgb = parseHexColor(background);
  if (!rgb) return background;

  let current = rgb;
  // 40 passos de 4% cobrem do branco puro até ~19% do valor original, bem além
  // do necessário pra qualquer matiz; o limite existe só pra não iterar solto.
  for (let step = 0; step < 40; step += 1) {
    if (contrastRatio(luminanceOf(current), 1) >= MIN_CONTRAST) break;
    current = { r: current.r * 0.96, g: current.g * 0.96, b: current.b * 0.96 };
  }

  return toHex(current);
}

function luminanceOf({ r, g, b }: Rgb): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

// ─── Cor de acento escolhida pelo usuário (estágio de lista) ────────────────

// Fundos onde uma cor de acento aparece: `--c41-surface` no tema claro e no
// escuro. A bolinha de estágio (StageDot) desenha a cor como borda/preenchimento
// direto sobre eles, sem pílula por trás — então uma cor perto do preto some no
// tema escuro e uma perto do branco some no claro.
const SURFACE_LIGHT_LUMINANCE = 1; // #FFFFFF
const SURFACE_DARK_LUMINANCE = 0.011; // #1C1A22

// Piso de contraste exigido contra os dois fundos.
//
// A WCAG pede 3:1 para elemento gráfico, mas 3:1 contra o fundo escuro reprova
// duas cores da própria paleta do app (#586577, o cinza padrão, fica em 2.90;
// #4F46E5 em 2.74) — o limiar rígido brigaria com o Design System em vez de
// corrigir o problema real. 2.5:1 passa toda a paleta atual intacta e ainda
// barra o que de fato quebra a leitura: preto (1.22 contra o fundo escuro),
// quase-preto (~1.0) e branco/amarelo puro (~1.0 contra o claro).
const MIN_ACCENT_CONTRAST = 2.5;

/** A cor é legível sobre a superfície dos dois temas? */
export function isUsableAccent(color: string): boolean {
  const luminance = relativeLuminance(color);
  if (luminance === null) return true; // não-hex: sem o que calcular

  return (
    contrastRatio(luminance, SURFACE_LIGHT_LUMINANCE) >= MIN_ACCENT_CONTRAST &&
    contrastRatio(luminance, SURFACE_DARK_LUMINANCE) >= MIN_ACCENT_CONTRAST
  );
}

/**
 * Puxa uma cor de acento para dentro da faixa legível nos dois temas.
 *
 * Corrigir em vez de recusar é deliberado: o usuário escolhe no `<input
 * type="color">` arrastando o cursor, e um "cor inválida" no meio do arrasto é
 * pior que entregar o tom mais próximo que funciona. Quem escolhe preto recebe
 * um chumbo; quem escolhe amarelo-limão recebe mostarda — a intenção de matiz
 * sobrevive, a ilegibilidade não.
 *
 * Escurecer multiplica os canais (preserva a matiz); clarear mistura com
 * branco, porque multiplicar nunca tira o preto puro do lugar.
 */
export function normalizeAccentColor(color: string): string {
  const rgb = parseHexColor(color);
  if (!rgb) return color;

  let current = rgb;

  // Escura demais para o tema escuro → clareia.
  for (let step = 0; step < 40; step += 1) {
    if (contrastRatio(luminanceOf(current), SURFACE_DARK_LUMINANCE) >= MIN_ACCENT_CONTRAST) break;
    current = {
      r: current.r + (255 - current.r) * 0.06,
      g: current.g + (255 - current.g) * 0.06,
      b: current.b + (255 - current.b) * 0.06,
    };
  }

  // Clara demais para o tema claro → escurece.
  for (let step = 0; step < 40; step += 1) {
    if (contrastRatio(luminanceOf(current), SURFACE_LIGHT_LUMINANCE) >= MIN_ACCENT_CONTRAST) break;
    current = { r: current.r * 0.96, g: current.g * 0.96, b: current.b * 0.96 };
  }

  return toHex(current);
}
