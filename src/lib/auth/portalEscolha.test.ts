import { beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { signPortalEscolha, verifyPortalEscolha, verifyAccess, verifyPortalAccess } from "./jwt";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
});

describe("token de escolha do portal", () => {
  it("devolve as contas que a senha liberou", () => {
    expect(verifyPortalEscolha(signPortalEscolha(["a", "b"]))).toEqual(["a", "b"]);
  });

  // O motivo da chave derivada: com a chave pura, este token passaria como
  // sessão interna, porque verifyAccess só recusa kind "portal".
  it("não vale como sessão interna nem como sessão do portal", () => {
    const token = signPortalEscolha(["a"]);
    expect(() => verifyAccess(token)).toThrow();
    expect(() => verifyPortalAccess(token)).toThrow();
  });

  it("token de sessão não vale como escolha", () => {
    const sessao = jwt.sign({ kind: "portal", sub: "a", tenantId: "t", clientGroupId: "g" }, "segredo-de-teste");
    expect(verifyPortalEscolha(sessao)).toBeNull();
  });

  it("token forjado, vencido ou lixo não vale", () => {
    const forjado = jwt.sign({ kind: "portal_escolha", contas: ["a"] }, "outra-chave");
    expect(verifyPortalEscolha(forjado)).toBeNull();
    const vencido = jwt.sign(
      { kind: "portal_escolha", contas: ["a"], exp: Math.floor(Date.now() / 1000) - 10 },
      "segredo-de-teste:portal-escolha"
    );
    expect(verifyPortalEscolha(vencido)).toBeNull();
    expect(verifyPortalEscolha("lixo")).toBeNull();
  });
});
