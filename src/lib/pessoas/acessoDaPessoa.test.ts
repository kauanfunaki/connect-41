import { describe, expect, it } from "vitest";
import { abaDeAcesso, contasLivres, destinoDepoisDoUsuario } from "./acessoDaPessoa";

describe("destinoDepoisDoUsuario", () => {
  it("volta para a aba Acesso da pessoa", () => {
    expect(destinoDepoisDoUsuario(abaDeAcesso("3f2a-9c"))).toBe("/pessoas/3f2a-9c?tab=acesso");
  });

  it("qualquer outro endereço volta para Usuários", () => {
    for (const v of [null, "", "/pessoas/abc", "https://exemplo.com", "//exemplo.com/pessoas/a?tab=acesso", "/pessoas/a/b?tab=acesso", "/admin/tenant"]) {
      expect(destinoDepoisDoUsuario(v), String(v)).toBe("/admin/usuarios");
    }
  });
});

describe("contasLivres", () => {
  it("tira as contas que já são de alguma pessoa", () => {
    const contas = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(contasLivres(contas, new Set(["b"])).map((c) => c.id)).toEqual(["a", "c"]);
  });
});
