import { beforeAll, describe, expect, it } from "vitest";
import { avaliarEnvio, emitirCarimbo, HORAS_DE_VALIDADE_DO_CARIMBO } from "./antiRobo";

const ABERTA = new Date("2026-09-16T12:00:00Z");
const depois = (segundos: number) => new Date(ABERTA.getTime() + segundos * 1000);

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
});

describe("avaliarEnvio", () => {
  it("gente que leu o formulário passa", () => {
    expect(avaliarEnvio({ carimbo: emitirCarimbo(ABERTA), armadilha: "", agora: depois(40) })).toBe("humano");
  });

  it("campo-armadilha preenchido é robô", () => {
    expect(avaliarEnvio({ carimbo: emitirCarimbo(ABERTA), armadilha: "https://spam.test", agora: depois(40) })).toBe(
      "robo"
    );
  });

  it("envio em menos de 3 segundos é robô", () => {
    expect(avaliarEnvio({ carimbo: emitirCarimbo(ABERTA), armadilha: null, agora: depois(1) })).toBe("robo");
  });

  // Quem posta direto na API nunca abriu a página.
  it("sem carimbo, ou com carimbo forjado, é inválido", () => {
    expect(avaliarEnvio({ carimbo: null, armadilha: null, agora: depois(40) })).toBe("carimbo_invalido");
    const [ms] = emitirCarimbo(ABERTA).split(".");
    expect(avaliarEnvio({ carimbo: `${ms}.assinatura-inventada`, armadilha: null, agora: depois(40) })).toBe(
      "carimbo_invalido"
    );
    const outraHora = emitirCarimbo(ABERTA).split(".")[1];
    expect(avaliarEnvio({ carimbo: `${ABERTA.getTime() - 60_000}.${outraHora}`, armadilha: null, agora: depois(40) })).toBe(
      "carimbo_invalido"
    );
  });

  it("carimbo velho ou do futuro é inválido", () => {
    expect(
      avaliarEnvio({
        carimbo: emitirCarimbo(ABERTA),
        armadilha: null,
        agora: depois(HORAS_DE_VALIDADE_DO_CARIMBO * 3600 + 1),
      })
    ).toBe("carimbo_invalido");
    expect(avaliarEnvio({ carimbo: emitirCarimbo(depois(60)), armadilha: null, agora: ABERTA })).toBe("carimbo_invalido");
  });
});
