import { describe, expect, it } from "vitest";
import { nomeExibicao, razaoSocialSecundaria } from "./companyName";

describe("nomeExibicao", () => {
  it("usa o apelido quando existe", () => {
    expect(nomeExibicao({ name: "BLD LOGISTICA LTDA", displayName: "BLD MOGI - SP" })).toBe("BLD MOGI - SP");
  });

  it("cai na razão social quando não há apelido", () => {
    expect(nomeExibicao({ name: "BLD LOGISTICA LTDA", displayName: null })).toBe("BLD LOGISTICA LTDA");
    expect(nomeExibicao({ name: "BLD LOGISTICA LTDA" })).toBe("BLD LOGISTICA LTDA");
  });

  it("apelido em branco não vira nome vazio na tela", () => {
    expect(nomeExibicao({ name: "BLD LOGISTICA LTDA", displayName: "   " })).toBe("BLD LOGISTICA LTDA");
  });

  it("tira o espaço das pontas do apelido", () => {
    expect(nomeExibicao({ name: "X", displayName: "  BLD MAFRA - SC  " })).toBe("BLD MAFRA - SC");
  });
});

describe("razaoSocialSecundaria", () => {
  it("devolve a razão social quando ela acrescenta algo", () => {
    expect(razaoSocialSecundaria({ name: "BLD LOGISTICA LTDA", displayName: "BLD MOGI - SP" })).toBe(
      "BLD LOGISTICA LTDA"
    );
  });

  it("devolve null quando repetiria o nome já exibido", () => {
    expect(razaoSocialSecundaria({ name: "BLD LOGISTICA LTDA", displayName: null })).toBeNull();
    expect(razaoSocialSecundaria({ name: "BLD LOGISTICA LTDA", displayName: "  " })).toBeNull();
  });
});
