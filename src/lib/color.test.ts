import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  contrastWithWhite,
  darkenUntilReadableOnWhiteText,
  isUsableAccent,
  normalizeAccentColor,
  parseHexColor,
  readableTextOn,
  relativeLuminance,
} from "./color";

const DARK_TEXT = "#16181D";
const LIGHT_TEXT = "#FFFFFF";

describe("parseHexColor", () => {
  it("lê 6 dígitos com e sem cerquilha", () => {
    expect(parseHexColor("#1F5EEA")).toEqual({ r: 31, g: 94, b: 234 });
    expect(parseHexColor("1F5EEA")).toEqual({ r: 31, g: 94, b: 234 });
  });

  it("expande a forma de 3 dígitos", () => {
    expect(parseHexColor("#f0a")).toEqual({ r: 255, g: 0, b: 170 });
  });

  it("ignora espaços em volta e caixa das letras", () => {
    expect(parseHexColor("  #AbCdEf  ")).toEqual({ r: 171, g: 205, b: 239 });
  });

  it("devolve null pro que não é hex", () => {
    expect(parseHexColor("var(--c41-fg-muted)")).toBeNull();
    expect(parseHexColor("rgb(0,0,0)")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
    expect(parseHexColor("")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("ancora nos extremos", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("pesa verde acima de vermelho e azul", () => {
    const green = relativeLuminance("#00FF00")!;
    const red = relativeLuminance("#FF0000")!;
    const blue = relativeLuminance("#0000FF")!;
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it("devolve null pro que não é hex", () => {
    expect(relativeLuminance("var(--x)")).toBeNull();
  });
});

describe("readableTextOn", () => {
  it("usa texto claro sobre fundo escuro", () => {
    expect(readableTextOn("#1F5EEA")).toBe(LIGHT_TEXT); // azul da marca
    expect(readableTextOn("#586577")).toBe(LIGHT_TEXT); // cinza padrão de estágio
    expect(readableTextOn("#000000")).toBe(LIGHT_TEXT);
  });

  it("usa texto escuro sobre fundo claro", () => {
    expect(readableTextOn("#FFFFFF")).toBe(DARK_TEXT);
    expect(readableTextOn("#FFD400")).toBe(DARK_TEXT); // amarelo
    expect(readableTextOn("#7BE3A1")).toBe(DARK_TEXT); // verde claro
  });

  // Vermelho forte de status: o branco vence de fato (4,56 contra 3,90), não é
  // empate. Vale como regressão porque um limiar fixo em luminância pura
  // (0.179, calculado contra preto) classificaria este fundo como "claro" e
  // devolveria texto escuro — que aqui é a opção PIOR.
  it("escolhe branco no vermelho de status", () => {
    const luminance = relativeLuminance("#E02D3C")!;
    const onLight = contrastRatio(luminance, relativeLuminance("#FFFFFF")!);
    const onDark = contrastRatio(luminance, relativeLuminance(DARK_TEXT)!);
    expect(onLight).toBeGreaterThan(onDark);
    expect(readableTextOn("#E02D3C")).toBe(LIGHT_TEXT);
  });

  it("mantém o escuro quando ele vence com folga", () => {
    expect(readableTextOn("#FFB27A")).toBe(DARK_TEXT); // laranja claro
  });

  it("nunca devolve um par abaixo de 4,5:1 nas cores de status usadas", () => {
    for (const bg of ["#1F5EEA", "#586577", "#E02D3C", "#FFD400", "#7BE3A1", "#FFB27A"]) {
      const ratio = contrastRatio(relativeLuminance(bg)!, relativeLuminance(readableTextOn(bg))!);
      expect(ratio, `contraste insuficiente em ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("darkenUntilReadableOnWhiteText", () => {
  // As cores que apareceram com letra preta na lista de tarefas.
  const CORES_DE_STATUS = ["#1F5EEA", "#586577", "#E02D3C", "#FFD400", "#7BE3A1", "#FFB27A", "#FFFFFF"];

  it("garante 4,5:1 contra branco em toda cor de status", () => {
    for (const bg of CORES_DE_STATUS) {
      const ajustada = darkenUntilReadableOnWhiteText(bg);
      expect(contrastWithWhite(ajustada)!, `contraste insuficiente em ${bg} → ${ajustada}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("não mexe numa cor que já passa", () => {
    expect(darkenUntilReadableOnWhiteText("#1F5EEA")).toBe("#1F5EEA");
  });

  it("escurece de fato as cores claras", () => {
    for (const bg of ["#FFD400", "#7BE3A1", "#FFFFFF"]) {
      expect(contrastWithWhite(bg)!).toBeLessThan(4.5); // premissa: entram reprovadas
      expect(darkenUntilReadableOnWhiteText(bg)).not.toBe(bg);
    }
  });

  // Escurecer proporcionalmente preserva a matiz — um amarelo tem que virar
  // mostarda, não cinza. Se o canal dominante deixasse de dominar, o usuário
  // não reconheceria mais a cor que escolheu.
  it("preserva a matiz ao escurecer", () => {
    const amarelo = parseHexColor(darkenUntilReadableOnWhiteText("#FFD400"))!;
    expect(amarelo.r).toBeGreaterThan(amarelo.b);
    expect(amarelo.g).toBeGreaterThan(amarelo.b);

    const verde = parseHexColor(darkenUntilReadableOnWhiteText("#7BE3A1"))!;
    expect(verde.g).toBeGreaterThan(verde.r);
    expect(verde.g).toBeGreaterThan(verde.b);
  });

  it("devolve a entrada quando não é hex", () => {
    expect(darkenUntilReadableOnWhiteText("var(--c41-fg-muted)")).toBe("var(--c41-fg-muted)");
  });

  it("cai no texto claro quando a cor não é hex", () => {
    expect(readableTextOn("var(--c41-fg-muted)")).toBe(LIGHT_TEXT);
  });
});

describe("normalizeAccentColor / isUsableAccent", () => {
  // Toda cor que o app já usa como estágio ou setor tem que sobreviver intacta —
  // se a guarda mexesse nelas, ela estaria brigando com o Design System em vez
  // de proteger o usuário de si mesmo.
  const PALETA_DO_APP = [
    "#586577", "#2E6FB8", "#C8860D", "#1E8E5A", "#C5374B",
    "#2563EB", "#CA8A04", "#059669", "#7C5CBF", "#0E9384",
    "#4F46E5", "#B7791F", "#E15A2B", "#0891B2",
  ];

  it("não altera nenhuma cor da paleta do app", () => {
    for (const cor of PALETA_DO_APP) {
      expect(isUsableAccent(cor)).toBe(true);
      expect(normalizeAccentColor(cor)).toBe(cor.toUpperCase());
    }
  });

  it("reprova e clareia cores escuras demais para o tema escuro", () => {
    for (const cor of ["#000000", "#111111", "#16181D", "#1A2340"]) {
      expect(isUsableAccent(cor)).toBe(false);
      const corrigida = normalizeAccentColor(cor);
      expect(corrigida).not.toBe(cor);
      expect(isUsableAccent(corrigida)).toBe(true);
    }
  });

  it("reprova e escurece cores claras demais para o tema claro", () => {
    for (const cor of ["#FFFFFF", "#FFFF00", "#F0FFF4"]) {
      expect(isUsableAccent(cor)).toBe(false);
      const corrigida = normalizeAccentColor(cor);
      expect(corrigida).not.toBe(cor);
      expect(isUsableAccent(corrigida)).toBe(true);
    }
  });

  // Um azul-marinho quase preto deve sair azul, não cinza — a correção só
  // levanta a luminância, não descarta a escolha do usuário.
  it("preserva a matiz ao clarear", () => {
    const azul = parseHexColor(normalizeAccentColor("#050A2E"))!;
    expect(azul.b).toBeGreaterThan(azul.r);
    expect(azul.b).toBeGreaterThan(azul.g);
  });

  it("é idempotente", () => {
    for (const cor of ["#000000", "#FFFF00", "#586577"]) {
      const uma = normalizeAccentColor(cor);
      expect(normalizeAccentColor(uma)).toBe(uma);
    }
  });

  it("devolve a entrada quando não é hex", () => {
    expect(normalizeAccentColor("var(--c41-fg-muted)")).toBe("var(--c41-fg-muted)");
    expect(isUsableAccent("var(--c41-fg-muted)")).toBe(true);
  });
});
