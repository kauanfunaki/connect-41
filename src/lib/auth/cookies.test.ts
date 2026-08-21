import { afterEach, describe, expect, it } from "vitest";
import { accessCookieOptions, refreshCookieOptions, sessionCookieDomain } from "./cookies";

const original = process.env.APP_DOMAIN;
afterEach(() => {
  if (original === undefined) delete process.env.APP_DOMAIN;
  else process.env.APP_DOMAIN = original;
});

describe("sessionCookieDomain", () => {
  it("sem APP_DOMAIN o cookie é host-only", () => {
    delete process.env.APP_DOMAIN;
    expect(sessionCookieDomain()).toBeUndefined();
  });

  it("com APP_DOMAIN o cookie vale nos subdomínios", () => {
    process.env.APP_DOMAIN = "useconnect.com.br";
    expect(sessionCookieDomain()).toBe(".useconnect.com.br");
  });

  it("tolera ponto e caixa alta na configuração", () => {
    process.env.APP_DOMAIN = ".UseConnect.com.br ";
    expect(sessionCookieDomain()).toBe(".useconnect.com.br");
  });
});

// O navegador só apaga um cookie quando o `domain` do apagamento é IGUAL ao da
// gravação. Se o logout esquecer o atributo, a sessão SOBREVIVE ao logout — e o
// defeito só apareceria depois do endereço por setor entrar no ar.
describe("gravar e apagar usam as mesmas opções", () => {
  it("access: mesmo domínio e mesmo path ao gravar e ao apagar", () => {
    process.env.APP_DOMAIN = "useconnect.com.br";
    const grava = accessCookieOptions(900);
    const apaga = accessCookieOptions(0);
    expect(apaga.domain).toBe(grava.domain);
    expect(apaga.path).toBe(grava.path);
    expect(apaga.maxAge).toBe(0);
  });

  it("refresh: mesmo domínio e mesmo path ao gravar e ao apagar", () => {
    process.env.APP_DOMAIN = "useconnect.com.br";
    const grava = refreshCookieOptions(604800);
    const apaga = refreshCookieOptions(0);
    expect(apaga.domain).toBe(grava.domain);
    expect(apaga.path).toBe(grava.path);
    expect(grava.path).toBe("/api/auth");
  });

  it("sem APP_DOMAIN, nenhum dos dois carrega domínio", () => {
    delete process.env.APP_DOMAIN;
    expect(accessCookieOptions(900).domain).toBeUndefined();
    expect(refreshCookieOptions(0).domain).toBeUndefined();
  });
});

describe("atributos de segurança", () => {
  it("os cookies de sessão são httpOnly e sameSite lax", () => {
    const opts = accessCookieOptions(900);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
  });
});
