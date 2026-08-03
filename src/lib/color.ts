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
