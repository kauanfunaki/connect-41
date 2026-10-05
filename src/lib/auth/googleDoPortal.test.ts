import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import {
  configuracaoDoGoogleNoPortal,
  conferirRetornoDoGoogle,
  lerCookieDaEscolha,
  lerCookieDoEstado,
  mensagemDoGoogle,
  novoEstadoDoGoogle,
  redirectUriDoPortal,
  trocarCodigoDoGoogle,
  urlDeAutorizacaoDoGoogle,
  validarIdTokenDoGoogle,
  valorDoCookieDaEscolha,
  valorDoCookieDoEstado,
} from "./googleDoPortal";

const CLIENT_ID = "123-abc.apps.googleusercontent.com";
const AGORA = new Date("2026-10-05T12:00:00Z");

describe("configuração", () => {
  it("o redirect URI do portal sai do APP_PUBLIC_URL, no caminho próprio do login", () => {
    expect(redirectUriDoPortal({ APP_PUBLIC_URL: "https://useconnect.com.br" })).toBe(
      "https://useconnect.com.br/portal/login/google/callback"
    );
    // Barra no fim ou caminho no APP_PUBLIC_URL não mudam o endereço: vale a origem.
    expect(redirectUriDoPortal({ APP_PUBLIC_URL: "https://app.useconnect.com.br/" })).toBe(
      "https://app.useconnect.com.br/portal/login/google/callback"
    );
  });

  it("PORTAL_GOOGLE_REDIRECT_URI ganha do APP_PUBLIC_URL; valor quebrado desliga", () => {
    expect(
      redirectUriDoPortal({ APP_PUBLIC_URL: "https://useconnect.com.br", PORTAL_GOOGLE_REDIRECT_URI: "http://localhost:3000/portal/login/google/callback" })
    ).toBe("http://localhost:3000/portal/login/google/callback");
    expect(redirectUriDoPortal({ PORTAL_GOOGLE_REDIRECT_URI: "não é url" })).toBeNull();
    expect(redirectUriDoPortal({})).toBeNull();
  });

  it("sem client id, segredo ou endereço, o Google fica fora do login", () => {
    const completo = { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: "s", APP_PUBLIC_URL: "https://useconnect.com.br" };
    expect(configuracaoDoGoogleNoPortal(completo)).toEqual({
      clientId: CLIENT_ID,
      clientSecret: "s",
      redirectUri: "https://useconnect.com.br/portal/login/google/callback",
    });
    expect(configuracaoDoGoogleNoPortal({ ...completo, GOOGLE_CLIENT_SECRET: "" })).toBeNull();
    expect(configuracaoDoGoogleNoPortal({ ...completo, GOOGLE_CLIENT_ID: undefined })).toBeNull();
    expect(configuracaoDoGoogleNoPortal({ ...completo, APP_PUBLIC_URL: undefined })).toBeNull();
  });
});

describe("a ida", () => {
  it("pede só identidade, com escolha de conta, state e nonce — sem acesso offline", () => {
    const estado = novoEstadoDoGoogle(true);
    const url = new URL(urlDeAutorizacaoDoGoogle({ clientId: CLIENT_ID, redirectUri: "https://x.test/portal/login/google/callback" }, estado));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.test/portal/login/google/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("state")).toBe(estado.state);
    expect(url.searchParams.get("nonce")).toBe(estado.nonce);
    expect(url.searchParams.has("access_type")).toBe(false);
  });

  it("state e nonce são aleatórios e diferentes entre si", () => {
    const a = novoEstadoDoGoogle(false);
    const b = novoEstadoDoGoogle(false);
    expect(a.state).not.toBe(b.state);
    expect(a.state).not.toBe(a.nonce);
    expect(a.state.length).toBeGreaterThanOrEqual(32);
  });

  it("o cookie do estado vai e volta, com o lembrar", () => {
    const estado = novoEstadoDoGoogle(true);
    expect(lerCookieDoEstado(valorDoCookieDoEstado(estado))).toEqual(estado);
    expect(lerCookieDoEstado(valorDoCookieDoEstado({ ...estado, lembrar: false }))?.lembrar).toBe(false);
    expect(lerCookieDoEstado("lixo")).toBeNull();
    expect(lerCookieDoEstado("a.b.2")).toBeNull();
    expect(lerCookieDoEstado(undefined)).toBeNull();
  });
});

describe("a volta", () => {
  const estado = novoEstadoDoGoogle(true);
  const cookie = valorDoCookieDoEstado(estado);

  it("state igual ao do cookie libera o code, com o nonce e o lembrar da ida", () => {
    expect(conferirRetornoDoGoogle({ cookie, state: estado.state, code: "c0de", erro: null })).toEqual({
      ok: true,
      code: "c0de",
      nonce: estado.nonce,
      lembrar: true,
    });
  });

  it("cancelar no Google, state trocado, sem cookie ou sem code não entra", () => {
    expect(conferirRetornoDoGoogle({ cookie, state: estado.state, code: null, erro: "access_denied" })).toEqual({ ok: false, motivo: "cancelado" });
    expect(conferirRetornoDoGoogle({ cookie, state: "outro", code: "c0de", erro: null })).toEqual({ ok: false, motivo: "expirou" });
    expect(conferirRetornoDoGoogle({ cookie: undefined, state: estado.state, code: "c0de", erro: null })).toEqual({ ok: false, motivo: "expirou" });
    expect(conferirRetornoDoGoogle({ cookie, state: estado.state, code: null, erro: null })).toEqual({ ok: false, motivo: "expirou" });
  });

  it("troca o code no endpoint do Google e devolve só o id_token", async () => {
    const buscar = vi.fn(async () => new Response(JSON.stringify({ id_token: "tok", access_token: "a" }), { status: 200 }));
    const cfg = { clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x.test/cb" };
    await expect(trocarCodigoDoGoogle("c0de", cfg, buscar as unknown as typeof fetch)).resolves.toBe("tok");
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const corpo = new URLSearchParams(String(init.body));
    expect(corpo.get("code")).toBe("c0de");
    expect(corpo.get("redirect_uri")).toBe("https://x.test/cb");
    expect(corpo.get("grant_type")).toBe("authorization_code");

    const recusa = vi.fn(async () => new Response("invalid_grant", { status: 400 }));
    await expect(trocarCodigoDoGoogle("c0de", cfg, recusa as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe("o id_token", () => {
  let chaves: JWTVerifyGetKey;
  let assinar: (claims: Record<string, unknown>, o?: { emissor?: string; destinatario?: string; validade?: number }) => Promise<string>;
  let assinarComOutraChave: (claims: Record<string, unknown>) => Promise<string>;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const outra = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    chaves = createLocalJWKSet({ keys: [jwk] });
    const montar = (claims: Record<string, unknown>, o: { emissor?: string; destinatario?: string; validade?: number } = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(o.emissor ?? "https://accounts.google.com")
        .setAudience(o.destinatario ?? CLIENT_ID)
        .setSubject("1234567890")
        .setIssuedAt(Math.floor(AGORA.getTime() / 1000))
        .setExpirationTime(o.validade ?? Math.floor(AGORA.getTime() / 1000) + 3600);
    assinar = (claims, o) => montar(claims, o).sign(privateKey);
    assinarComOutraChave = (claims) => montar(claims).sign(outra.privateKey);
  });

  const CLAIMS = { email: "Maria@Empresa.com.br", email_verified: true, nonce: "n1", name: "Maria" };
  const validar = (token: string, nonce = "n1") => validarIdTokenDoGoogle(token, { clientId: CLIENT_ID, nonce, chaves, agora: AGORA });

  it("token bom devolve o e-mail em minúsculas", async () => {
    await expect(validar(await assinar(CLAIMS))).resolves.toEqual({ email: "maria@empresa.com.br", nome: "Maria" });
  });

  it("o emissor antigo do Google (sem https) também vale", async () => {
    await expect(validar(await assinar(CLAIMS, { emissor: "accounts.google.com" }))).resolves.toMatchObject({ email: "maria@empresa.com.br" });
  });

  it("token para outro client id, de outro emissor ou assinado por outra chave é recusado", async () => {
    await expect(validar(await assinar(CLAIMS, { destinatario: "outro-app.apps.googleusercontent.com" }))).rejects.toThrow();
    await expect(validar(await assinar(CLAIMS, { emissor: "https://evil.test" }))).rejects.toThrow();
    await expect(validar(await assinarComOutraChave(CLAIMS))).rejects.toThrow();
  });

  it("token vencido é recusado", async () => {
    const vencido = await assinar(CLAIMS, { validade: Math.floor(AGORA.getTime() / 1000) - 60 });
    await expect(validar(vencido)).rejects.toThrow();
  });

  it("nonce de outra ida é recusado", async () => {
    await expect(validar(await assinar(CLAIMS), "n2")).rejects.toThrow("nonce");
    await expect(validar(await assinar({ ...CLAIMS, nonce: undefined }))).rejects.toThrow("nonce");
  });

  it("e-mail que o Google não verificou não entra", async () => {
    await expect(validar(await assinar({ ...CLAIMS, email_verified: false }))).rejects.toThrow("verificado");
    await expect(validar(await assinar({ ...CLAIMS, email_verified: undefined }))).rejects.toThrow("verificado");
    await expect(validar(await assinar({ ...CLAIMS, email: undefined }))).rejects.toThrow("e-mail");
  });
});

describe("a escolha de cliente e as mensagens", () => {
  it("o cookie da escolha separa o lembrar do token, que tem pontos", () => {
    const token = "aaa.bbb.ccc";
    expect(lerCookieDaEscolha(valorDoCookieDaEscolha(token, true))).toEqual({ token, lembrar: true });
    expect(lerCookieDaEscolha(valorDoCookieDaEscolha(token, false))).toEqual({ token, lembrar: false });
    expect(lerCookieDaEscolha("2.aaa")).toBeNull();
    expect(lerCookieDaEscolha("1.")).toBeNull();
    expect(lerCookieDaEscolha(undefined)).toBeNull();
  });

  it("cada motivo tem mensagem; a de sem acesso aponta a ficha só quando ela está no ar", () => {
    for (const m of ["cancelado", "expirou", "falhou", "sem-acesso", "indisponivel", "escolha-expirou"]) {
      expect(mensagemDoGoogle(m, { fichaDisponivel: false })).toBeTruthy();
    }
    expect(mensagemDoGoogle("sem-acesso", { fichaDisponivel: false })).toMatch(/não tem acesso ao portal/);
    expect(mensagemDoGoogle("sem-acesso", { fichaDisponivel: false })).not.toMatch(/Quero ser cliente/);
    expect(mensagemDoGoogle("sem-acesso", { fichaDisponivel: true })).toMatch(/Quero ser cliente/);
  });

  it("valor desconhecido na URL não vira mensagem", () => {
    expect(mensagemDoGoogle("qualquer", { fichaDisponivel: true })).toBeNull();
    expect(mensagemDoGoogle("toString", { fichaDisponivel: true })).toBeNull();
    expect(mensagemDoGoogle(undefined, { fichaDisponivel: true })).toBeNull();
  });
});
