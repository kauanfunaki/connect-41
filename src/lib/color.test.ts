import { describe, expect, it } from "vitest";
import { contrastRatio, parseHexColor, readableTextOn, relativeLuminance } from "./color";

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

  it("cai no texto claro quando a cor não é hex", () => {
    expect(readableTextOn("var(--c41-fg-muted)")).toBe(LIGHT_TEXT);
  });
});
