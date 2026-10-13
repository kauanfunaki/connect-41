import { describe, expect, it } from "vitest";
import { ehHostDoSite } from "./host";

const DOMINIO = "useconnect.com.br";

describe("ehHostDoSite", () => {
  it("o domínio principal e o www. são o site", () => {
    expect(ehHostDoSite("useconnect.com.br", DOMINIO)).toBe(true);
    expect(ehHostDoSite("www.useconnect.com.br", DOMINIO)).toBe(true);
  });

  it("ignora a porta", () => {
    expect(ehHostDoSite("useconnect.com.br:443", DOMINIO)).toBe(true);
    expect(ehHostDoSite("www.useconnect.com.br:3000", DOMINIO)).toBe(true);
  });

  it("ignora maiúsculas, no host e no domínio", () => {
    expect(ehHostDoSite("UseConnect.com.BR", DOMINIO)).toBe(true);
    expect(ehHostDoSite("WWW.useconnect.com.br", " UseConnect.com.br ")).toBe(true);
  });

  // O Connect continua nestes: a `/` deles leva ao /home, como sempre.
  it("app. e os setores não são o site", () => {
    expect(ehHostDoSite("app.useconnect.com.br", DOMINIO)).toBe(false);
    expect(ehHostDoSite("bpo.useconnect.com.br", DOMINIO)).toBe(false);
    expect(ehHostDoSite("societario.useconnect.com.br:3000", DOMINIO)).toBe(false);
    expect(ehHostDoSite("www.app.useconnect.com.br", DOMINIO)).toBe(false);
  });

  it("outro domínio, ou um que só termina igual, não é o site", () => {
    expect(ehHostDoSite("outrouseconnect.com.br", DOMINIO)).toBe(false);
    expect(ehHostDoSite("useconnect.com.br.outro.com", DOMINIO)).toBe(false);
    expect(ehHostDoSite("localhost:3000", DOMINIO)).toBe(false);
  });

  it("host vazio não é o site", () => {
    expect(ehHostDoSite("", DOMINIO)).toBe(false);
    expect(ehHostDoSite(null, DOMINIO)).toBe(false);
    expect(ehHostDoSite(undefined, DOMINIO)).toBe(false);
  });

  // Sem APP_DOMAIN não há como saber qual é o host principal: nada vira site,
  // e a `/` segue levando ao Connect (é o caso do ambiente local).
  it("sem APP_DOMAIN, nenhum host é o site", () => {
    expect(ehHostDoSite("useconnect.com.br", undefined)).toBe(false);
    expect(ehHostDoSite("useconnect.com.br", null)).toBe(false);
    expect(ehHostDoSite("useconnect.com.br", "")).toBe(false);
    expect(ehHostDoSite("localhost:3000", "  ")).toBe(false);
  });

  it("aceita o domínio com ponto na frente, como o baseDomain", () => {
    expect(ehHostDoSite("useconnect.com.br", ".useconnect.com.br")).toBe(true);
  });
});
