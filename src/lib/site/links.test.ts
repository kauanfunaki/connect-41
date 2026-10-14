import { describe, expect, it } from "vitest";
import { enderecoDoApp, linksDoSite } from "./links";

describe("enderecoDoApp", () => {
  it("com APP_PUBLIC_URL, o link é absoluto no endereço do Connect", () => {
    expect(enderecoDoApp("/login", "https://app.useconnect.com.br")).toBe("https://app.useconnect.com.br/login");
  });

  it("barra no fim ou caminho na variável não mudam o endereço: vale a origem", () => {
    expect(enderecoDoApp("/login", "https://app.useconnect.com.br/")).toBe("https://app.useconnect.com.br/login");
    expect(enderecoDoApp("/login", "https://app.useconnect.com.br/home")).toBe("https://app.useconnect.com.br/login");
    expect(enderecoDoApp("/login", "  https://app.useconnect.com.br  ")).toBe("https://app.useconnect.com.br/login");
  });

  it("mantém a porta do ambiente local", () => {
    expect(enderecoDoApp("/portal/login", "http://localhost:3100")).toBe("http://localhost:3100/portal/login");
  });

  // O host principal ainda serve o login e o portal: o link relativo funciona
  // igual, só não troca de endereço.
  it("sem APP_PUBLIC_URL, ou com valor quebrado, o link fica relativo", () => {
    expect(enderecoDoApp("/login", undefined)).toBe("/login");
    expect(enderecoDoApp("/login", null)).toBe("/login");
    expect(enderecoDoApp("/login", "")).toBe("/login");
    expect(enderecoDoApp("/login", "   ")).toBe("/login");
    expect(enderecoDoApp("/login", "app.useconnect.com.br")).toBe("/login");
  });
});

describe("linksDoSite", () => {
  // Sem o das vagas desde 14/10/2026: o portal de vagas é o 41 Carreiras.
  it("monta os quatro links do site no endereço do Connect", () => {
    expect(linksDoSite("https://app.useconnect.com.br")).toEqual({
      portal: "https://app.useconnect.com.br/portal/login",
      entrar: "https://app.useconnect.com.br/login",
      abrir: "https://app.useconnect.com.br/home",
      privacidade: "https://app.useconnect.com.br/portal/privacidade",
    });
  });

  it("sem APP_PUBLIC_URL, os mesmos caminhos, relativos", () => {
    expect(linksDoSite(undefined)).toEqual({
      portal: "/portal/login",
      entrar: "/login",
      abrir: "/home",
      privacidade: "/portal/privacidade",
    });
  });
});
