import { describe, it, expect } from "vitest";
import { usoAnthropic, usoOpenAi } from "./uso";

describe("usoAnthropic", () => {
  it("lê entrada e saída", () => {
    expect(usoAnthropic({ input_tokens: 1200, output_tokens: 300 })).toEqual({
      entrada: 1200,
      saida: 300,
    });
  });

  // A razão de o arquivo existir: ausência não é chamada de graça.
  it("sem bloco de uso é desconhecido, não zero", () => {
    expect(usoAnthropic(undefined)).toBeNull();
    expect(usoAnthropic(null)).toBeNull();
  });

  it("bloco pela metade também é desconhecido", () => {
    expect(usoAnthropic({ input_tokens: 100 })).toBeNull();
    expect(usoAnthropic({ output_tokens: 100 })).toBeNull();
  });

  it("zero token declarado é zero, e isso é conhecido", () => {
    expect(usoAnthropic({ input_tokens: 0, output_tokens: 0 })).toEqual({ entrada: 0, saida: 0 });
  });
});

describe("usoOpenAi", () => {
  it("lê entrada e saída de um json qualquer", () => {
    expect(usoOpenAi({ input_tokens: 50, output_tokens: 10, total_tokens: 60 })).toEqual({
      entrada: 50,
      saida: 10,
    });
  });

  it("nada, formato errado ou campo faltando é desconhecido", () => {
    expect(usoOpenAi(undefined)).toBeNull();
    expect(usoOpenAi(null)).toBeNull();
    expect(usoOpenAi("42")).toBeNull();
    expect(usoOpenAi({})).toBeNull();
    expect(usoOpenAi({ input_tokens: 50 })).toBeNull();
  });

  // Formato antigo da Completions API: nomes diferentes. Reconhecer errado
  // seria pior que não reconhecer — daria um número que não é o desta chamada.
  it("nomes de outro formato não são adivinhados", () => {
    expect(usoOpenAi({ prompt_tokens: 50, completion_tokens: 10 })).toBeNull();
  });

  it("token como string não vira número", () => {
    expect(usoOpenAi({ input_tokens: "50", output_tokens: "10" })).toBeNull();
  });
});
