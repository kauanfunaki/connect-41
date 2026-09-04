import { describe, expect, it } from "vitest";
import { ehCaminhoDoPortal, ehRotaPublicaDoPortal, PREFIXO_DO_PORTAL } from "./portal";

describe("ehCaminhoDoPortal", () => {
  it("reconhece a raiz e o que está dentro", () => {
    expect(ehCaminhoDoPortal(PREFIXO_DO_PORTAL)).toBe(true);
    expect(ehCaminhoDoPortal("/portal/documentos")).toBe(true);
    expect(ehCaminhoDoPortal("/portal/login")).toBe(true);
  });

  it("rota interna não é portal", () => {
    for (const r of ["/", "/empresas", "/documentos-fiscais", "/admin/usuarios"]) {
      expect(ehCaminhoDoPortal(r)).toBe(false);
    }
  });

  // Um `startsWith("/portal")` cru deixaria `/portalzinho` — uma rota interna
  // que por acaso começa igual — cair do lado do cliente. É a mesma armadilha
  // de casar `<Numero>` e levar `<NumeroLote>`.
  it("caminho que só começa parecido não é o portal", () => {
    expect(ehCaminhoDoPortal("/portalzinho")).toBe(false);
    expect(ehCaminhoDoPortal("/portal-interno")).toBe(false);
  });
});

describe("ehRotaPublicaDoPortal", () => {
  it("entrar e recuperar senha dispensam sessão", () => {
    expect(ehRotaPublicaDoPortal("/portal/login")).toBe(true);
    expect(ehRotaPublicaDoPortal("/portal/esqueci-senha")).toBe(true);
    expect(ehRotaPublicaDoPortal("/portal/redefinir-senha")).toBe(true);
  });

  it("o resto do portal exige sessão", () => {
    expect(ehRotaPublicaDoPortal("/portal")).toBe(false);
    expect(ehRotaPublicaDoPortal("/portal/documentos")).toBe(false);
  });

  // `/portal/loginha` não é a tela de login. Mesma regra de segmento inteiro.
  it("rota que começa parecido com uma pública não é pública", () => {
    expect(ehRotaPublicaDoPortal("/portal/loginha")).toBe(false);
  });
});
