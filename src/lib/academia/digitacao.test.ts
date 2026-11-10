import { describe, expect, it } from "vitest";
import { avaliarDigitacao, contarPalavras, duracaoQueVale, palavrasPorMinuto, precisaoDaDigitacao, type TelemetriaDaDigitacao } from "./digitacao";

// A conta da digitação na régua do 41 Hub (10/11/2026): o servidor refaz PPM
// e precisão a partir do texto digitado e do tempo, e descarta o que parece
// colagem, macro ou script.

const TEXTO = "O balancete do mês fecha quando todas as contas batem com o razão.";

describe("palavras por minuto e precisão", () => {
  it("palavra é o que está separado por espaço, certo ou errado (o Hub)", () => {
    expect(contarPalavras("  um  dois\ttrês\n")).toBe(3);
    expect(contarPalavras("   ")).toBe(0);
  });

  it("PPM da digitação: palavras ÷ minutos, arredondado", () => {
    expect(palavrasPorMinuto("digitacao", "um dois três quatro cinco", 30_000)).toBe(10);
    expect(palavrasPorMinuto("digitacao", "a b c", 0)).toBe(0);
  });

  it("PPM dos números: a palavra-padrão de 5 caracteres", () => {
    // 50 caracteres = 10 palavras, em 30 s = 20 PPM.
    expect(palavrasPorMinuto("numeros", "x".repeat(50), 30_000)).toBe(20);
  });

  it("precisão: certos na mesma posição ÷ o maior entre digitado e servido, duas casas", () => {
    expect(precisaoDaDigitacao("abcd", "abcd")).toBe(100);
    expect(precisaoDaDigitacao("abcd", "abxd")).toBe(75);
    // Parar no meio desconta: 2 certos de 4.
    expect(precisaoDaDigitacao("abcd", "ab")).toBe(50);
    expect(precisaoDaDigitacao("abc", "abd")).toBe(66.67);
    expect(precisaoDaDigitacao("", "")).toBe(0);
  });
});

describe("a duração que vale", () => {
  it("vale a do navegador perto do relógio do servidor", () => {
    expect(duracaoQueVale(58_000, 61_000)).toBe(58_000);
  });
  it("mais de 15 s abaixo do servidor: vale a do servidor (encurtar o tempo sobe o PPM)", () => {
    expect(duracaoQueVale(20_000, 40_000)).toBe(40_000);
  });
  it("maior que o relógio do servidor (+1 s de rede): vale a do servidor", () => {
    expect(duracaoQueVale(70_000, 60_000)).toBe(60_000);
    expect(duracaoQueVale(60_500, 60_000)).toBe(60_500);
  });
  it("teto de 90 s e número inválido cai no servidor", () => {
    expect(duracaoQueVale(120_000, 125_000)).toBe(90_000);
    expect(duracaoQueVale(Number.NaN, 30_000)).toBe(30_000);
  });
});

describe("avaliar o envio", () => {
  const base = { teste: "digitacao" as const, servido: TEXTO, digitado: TEXTO, duracaoDoNavegadorMs: 20_000, decorridoNoServidorMs: 21_000 };
  const humano: TelemetriaDaDigitacao = {
    colagens: 0, maiorSalto: 1, sintetico: false,
    teclas: 60, intervaloMedioMs: 180, desvioDoIntervaloMs: 90,
    pressoes: 60, pressaoMediaMs: 95, desvioDaPressaoMs: 30,
  };

  it("o texto inteiro, certo, em 20 s", () => {
    const r = avaliarDigitacao({ ...base, telemetria: humano });
    expect(r).toEqual({ ok: true, ppm: Math.round(contarPalavras(TEXTO) / (20_000 / 60_000)), precisao: 100, duracaoMs: 20_000 });
  });

  it("não confia no PPM do navegador: só o digitado e o tempo", () => {
    // O navegador diz 10 s, mas o servidor contou 40 s: vale 40 s.
    const r = avaliarDigitacao({ ...base, duracaoDoNavegadorMs: 10_000, decorridoNoServidorMs: 40_000 });
    expect(r.ok && r.duracaoMs).toBe(40_000);
  });

  it("colar, salto grande ou evento sintético: trapaça", () => {
    expect(avaliarDigitacao({ ...base, telemetria: { ...humano, colagens: 1 } })).toMatchObject({ ok: false, codigo: "trapaca" });
    expect(avaliarDigitacao({ ...base, telemetria: { ...humano, maiorSalto: 25 } })).toMatchObject({ ok: false, codigo: "trapaca" });
    expect(avaliarDigitacao({ ...base, telemetria: { ...humano, sintetico: true } })).toMatchObject({ ok: false, codigo: "trapaca" });
  });

  it("ritmo e pressão robóticos (variação quase zero) com 30 teclas ou mais", () => {
    expect(avaliarDigitacao({ ...base, telemetria: { ...humano, desvioDoIntervaloMs: 5 } })).toMatchObject({ ok: false, codigo: "trapaca" });
    expect(avaliarDigitacao({ ...base, telemetria: { ...humano, pressaoMediaMs: 3 } })).toMatchObject({ ok: false, codigo: "trapaca" });
    expect(avaliarDigitacao({ ...base, telemetria: { ...humano, desvioDaPressaoMs: 2 } })).toMatchObject({ ok: false, codigo: "trapaca" });
    // Com poucas teclas, não dá para julgar o ritmo.
    expect(avaliarDigitacao({ ...base, telemetria: { ...humano, teclas: 10, desvioDoIntervaloMs: 0, pressoes: 10, pressaoMediaMs: 1 } }).ok).toBe(true);
  });

  it("menos de 10 s, nada digitado ou precisão de até 50%: descartado", () => {
    expect(avaliarDigitacao({ ...base, duracaoDoNavegadorMs: 8_000, decorridoNoServidorMs: 8_500 })).toMatchObject({ ok: false, codigo: "curta" });
    expect(avaliarDigitacao({ ...base, digitado: "   " })).toMatchObject({ ok: false, codigo: "vazia" });
    expect(avaliarDigitacao({ ...base, digitado: TEXTO.slice(0, Math.floor(TEXTO.length / 2)) })).toMatchObject({ ok: false, codigo: "precisao_baixa" });
  });

  it("acima de 16 caracteres por segundo ou de 200 PPM: impossível", () => {
    const longo = "abc ".repeat(100).trim();
    expect(avaliarDigitacao({ ...base, servido: longo, digitado: longo, duracaoDoNavegadorMs: 12_000, decorridoNoServidorMs: 12_500 })).toMatchObject({ ok: false, codigo: "trapaca" });
    const palavrasCurtas = "a ".repeat(180).trim();
    // 180 palavras em 30 s = 360 PPM, com 359 caracteres (12/s): o teto do PPM pega.
    expect(avaliarDigitacao({ ...base, servido: palavrasCurtas, digitado: palavrasCurtas, duracaoDoNavegadorMs: 30_000, decorridoNoServidorMs: 30_500 })).toMatchObject({ ok: false, codigo: "trapaca" });
  });
});
