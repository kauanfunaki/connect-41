import { describe, expect, it } from "vitest";
import {
  NATUREZA_JURIDICA_MAX,
  erroDaNaturezaJuridica,
  formatarCodigoDaNatureza,
  naturezaJuridicaDaConsulta,
  naturezaJuridicaDoFormulario,
} from "./naturezaJuridica";

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("naturezaJuridica", () => {
  it("formata o código da tabela da Receita como NNN-N", () => {
    expect(formatarCodigoDaNatureza(2062)).toBe("206-2");
    expect(formatarCodigoDaNatureza("2135")).toBe("213-5");
    expect(formatarCodigoDaNatureza("206-2")).toBe("206-2");
    expect(formatarCodigoDaNatureza(206)).toBeNull();
    expect(formatarCodigoDaNatureza(0)).toBeNull();
    expect(formatarCodigoDaNatureza("0000")).toBeNull();
    expect(formatarCodigoDaNatureza(null)).toBeNull();
    expect(formatarCodigoDaNatureza(undefined)).toBeNull();
  });

  it("lê código e descrição da resposta da BrasilAPI", () => {
    expect(
      naturezaJuridicaDaConsulta({ codigo_natureza_juridica: 2062, natureza_juridica: "Sociedade Empresária Limitada" })
    ).toBe("206-2 - Sociedade Empresária Limitada");
    expect(
      naturezaJuridicaDaConsulta({ codigo_natureza_juridica: "2135", natureza_juridica: "  Empresário  (Individual) " })
    ).toBe("213-5 - Empresário (Individual)");
  });

  it("aceita a descrição que já vem com o código na frente", () => {
    expect(naturezaJuridicaDaConsulta({ natureza_juridica: "206-2 - Sociedade Empresária Limitada" })).toBe(
      "206-2 - Sociedade Empresária Limitada"
    );
    // O código do campo próprio não se repete na frente da descrição.
    expect(
      naturezaJuridicaDaConsulta({ codigo_natureza_juridica: 2062, natureza_juridica: "206-2 - Sociedade Empresária Limitada" })
    ).toBe("206-2 - Sociedade Empresária Limitada");
  });

  it("com só um dos dois, usa o que veio", () => {
    expect(naturezaJuridicaDaConsulta({ codigo_natureza_juridica: 2305 })).toBe("230-5");
    expect(naturezaJuridicaDaConsulta({ natureza_juridica: "Sociedade Anônima Fechada" })).toBe("Sociedade Anônima Fechada");
  });

  it("sem natureza na resposta, nada", () => {
    expect(naturezaJuridicaDaConsulta({})).toBeNull();
    expect(naturezaJuridicaDaConsulta({ codigo_natureza_juridica: null, natureza_juridica: "" })).toBeNull();
    expect(naturezaJuridicaDaConsulta(null)).toBeNull();
    expect(naturezaJuridicaDaConsulta("206-2")).toBeNull();
  });

  it("nunca passa do tamanho da coluna", () => {
    const longa = naturezaJuridicaDaConsulta({ codigo_natureza_juridica: 2062, natureza_juridica: "x".repeat(300) });
    expect(longa).toHaveLength(NATUREZA_JURIDICA_MAX);
  });

  it("lê o formulário e confere o tamanho", () => {
    expect(naturezaJuridicaDoFormulario(form({}))).toBeNull();
    expect(naturezaJuridicaDoFormulario(form({ naturezaJuridica: "   " }))).toBeNull();
    expect(naturezaJuridicaDoFormulario(form({ naturezaJuridica: " 206-2 -  Sociedade Empresária Limitada " }))).toBe(
      "206-2 - Sociedade Empresária Limitada"
    );
    expect(erroDaNaturezaJuridica(null)).toBeNull();
    expect(erroDaNaturezaJuridica("206-2 - Sociedade Empresária Limitada")).toBeNull();
    expect(erroDaNaturezaJuridica("x".repeat(NATUREZA_JURIDICA_MAX + 1))).toMatch(/120 caracteres/);
  });
});
