import { describe, expect, it } from "vitest";
import { camposAlterados, camposDoEnvio, inativaNoAcessorias } from "./acessoriasService";
import { honorarioDaFicha, type FichaAcessorias } from "./acessoriasClient";

const ficha = (extra: Partial<FichaAcessorias> = {}): FichaAcessorias => ({
  ID: "214",
  Identificador: "11.222.333/0001-81",
  Razao: "ALFA COMERCIO LTDA",
  Fantasia: "ALFA",
  Status: "Ativa",
  Honorario: "1412.00",
  Contatos: [{ Nome: "Ana" }, { Nome: "Bia" }],
  ...extra,
});

describe("camposAlterados", () => {
  it("honorário e data de alteração não contam", () => {
    expect(camposAlterados(ficha(), ficha({ Honorario: "1500.00", DtLastDH: "2026-11-12" }))).toEqual([]);
  });

  it("acusa campo apagado ou trocado", () => {
    expect(camposAlterados(ficha(), ficha({ Fantasia: "" }))).toEqual(["Fantasia"]);
    expect(camposAlterados(ficha(), ficha({ Razao: "OUTRA" }))).toEqual(["Razao"]);
  });

  it("ordem diferente na lista de contatos não é mudança", () => {
    expect(camposAlterados(ficha(), ficha({ Contatos: [{ Nome: "Bia" }, { Nome: "Ana" }] }))).toEqual([]);
  });

  it("ficha sumida depois do envio é alerta", () => {
    expect(camposAlterados(ficha(), null)).toEqual(["(ficha não encontrada depois do envio)"]);
  });
});

describe("camposDoEnvio", () => {
  it("manda o identificador como está, o honorário no formato da API e repete razão e fantasia", () => {
    expect(camposDoEnvio(ficha(), 1500)).toEqual({ cnpj: "11.222.333/0001-81", honorario: "1500.00", nome: "ALFA COMERCIO LTDA", fantasia: "ALFA" });
  });

  it("não manda fantasia vazia", () => {
    expect(camposDoEnvio(ficha({ Fantasia: "  " }), 10)).not.toHaveProperty("fantasia");
  });
});

describe("ficha do Acessórias", () => {
  it("inativa e honorário", () => {
    expect(inativaNoAcessorias(ficha({ Status: "Inativa" }))).toBe(true);
    expect(inativaNoAcessorias(ficha())).toBe(false);
    expect(honorarioDaFicha(ficha())).toBe(1412);
    expect(honorarioDaFicha(ficha({ Honorario: "" }))).toBeNull();
    expect(honorarioDaFicha(ficha({ Honorario: "759,50" }))).toBe(759.5);
    expect(honorarioDaFicha(null)).toBeNull();
  });
});
