// As contas do seletor de cor livre (05/11/2026): matiz, saturação e brilho
// (HSV), o modelo do quadrado + faixa de matiz. Puro, sem tela.

export type Hsv = { h: number; s: number; v: number };

const limitar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** `#RRGGBB` (ou `RGB`, com ou sem `#`) em HSV; `null` quando não é cor. h em 0–360, s e v em 0–1. */
export function hexParaHsv(hex: string): Hsv | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const cheio = m[1]!.length === 3 ? m[1]!.split("").map((c) => c + c).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(cheio.slice(i, i + 2), 16) / 255) as [number, number, number];
  const maior = Math.max(r, g, b);
  const menor = Math.min(r, g, b);
  const d = maior - menor;
  let h = 0;
  if (d > 0) {
    if (maior === r) h = ((g - b) / d) % 6;
    else if (maior === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: maior === 0 ? 0 : d / maior, v: maior };
}

/** HSV em `#RRGGBB`, maiúsculo (o formato que o Connect grava). */
export function hsvParaHex({ h, s, v }: Hsv): string {
  const hh = ((limitar(h, 0, 360) % 360) + 360) % 360;
  const ss = limitar(s, 0, 1);
  const vv = limitar(v, 0, 1);
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  const [r, g, b] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const parte = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${parte(r)}${parte(g)}${parte(b)}`.toUpperCase();
}
