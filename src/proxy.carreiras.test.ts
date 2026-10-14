import { afterEach, beforeEach, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

// O 41 Carreiras no proxy (14/10/2026). O que importa provar, na véspera da
// produção: com as variáveis do portal, o endereço dele só serve o portal — e
// todo outro host (o Connect, o site, os setores) continua exatamente igual;
// sem as variáveis, nada muda em lugar nenhum.

const CHAVE = "chave-de-teste-do-portal";
const PRINCIPAL = "carreiras.41contabil.com.br";
const PROVISORIO = "carreiras.useconnect.com.br";

const VARIAVEIS = [
  "JWT_ACCESS_SECRET",
  "APP_DOMAIN",
  "APP_PUBLIC_URL",
  "SECTOR_HOST_SUFFIX",
  "SECTOR_HOST_SUFFIX_ANTIGO",
  "CARREIRAS_HOSTS",
  "CARREIRAS_HOST_PRINCIPAL",
  "CARREIRAS_TENANT_SLUG",
] as const;
let salvo: Partial<Record<(typeof VARIAVEIS)[number], string | undefined>> = {};

beforeEach(() => {
  salvo = Object.fromEntries(VARIAVEIS.map((v) => [v, process.env[v]]));
  for (const v of VARIAVEIS) delete process.env[v];
  process.env.JWT_ACCESS_SECRET = CHAVE;
  // O ambiente de produção do Connect (13/10/2026).
  process.env.APP_DOMAIN = "useconnect.com.br";
  process.env.APP_PUBLIC_URL = "https://app.useconnect.com.br";
});

afterEach(() => {
  for (const v of VARIAVEIS) {
    if (salvo[v] === undefined) delete process.env[v];
    else process.env[v] = salvo[v];
  }
});

/** Liga o portal com os dois endereços, o principal sendo o da 41. */
function ligarOPortal() {
  process.env.CARREIRAS_HOSTS = `${PRINCIPAL},${PROVISORIO}`;
  process.env.CARREIRAS_HOST_PRINCIPAL = PRINCIPAL;
}

const SESSAO = { sub: "u1", tenantId: "t-41", role: "SUPER_ADMIN", sectors: ["recrutamento"], accessibleTenants: ["t-41"] };

function visitar(
  host: string,
  caminho: string,
  opcoes: { metodo?: string; sessao?: boolean; cabecalhos?: Record<string, string> } = {},
) {
  const headers = new Headers({ host, ...opcoes.cabecalhos });
  if (opcoes.sessao) headers.set("cookie", `access_token=${jwt.sign(SESSAO, CHAVE)}`);
  return proxy(new NextRequest(`https://${host}${caminho}`, { method: opcoes.metodo ?? "GET", headers }));
}

const destino = (res: Response) => res.headers.get("location");
const reescrito = (res: Response) => {
  const url = res.headers.get("x-middleware-rewrite");
  return url ? new URL(url) : null;
};
const passou = (res: Response) => res.headers.get("x-middleware-next") === "1";
const caminhoDoLogin = (res: Response) => new URL(destino(res)!).pathname;
const cabecalho = (res: Response, nome: string) => res.headers.get(`x-middleware-request-${nome}`);

describe("sem as variáveis do portal, tudo como antes", () => {
  it("carreiras.useconnect.com.br é um host do Connect qualquer: `/` pede login", async () => {
    const res = await visitar(PROVISORIO, "/");
    expect(caminhoDoLogin(res)).toBe("/login");
  });

  it("e nunca vira o setor \"carreiras\" — nem com sessão", async () => {
    const res = await visitar(PROVISORIO, "/home", { sessao: true });
    expect(passou(res)).toBe(true);
    expect(cabecalho(res, "x-user-id")).toBe("u1");
    expect(cabecalho(res, "x-active-sector")).toBeNull();
  });

  it("os links públicos de sempre passam, sem reescrita", async () => {
    for (const caminho of ["/carreiras", "/carreiras/41tech", "/carreiras/41tech/v1", "/carreiras/41tech/minha-conta"]) {
      const res = await visitar("app.useconnect.com.br", caminho);
      expect(passou(res), caminho).toBe(true);
      expect(reescrito(res), caminho).toBeNull();
    }
  });
});

describe("com o portal ligado, os outros hosts não mudam", () => {
  beforeEach(ligarOPortal);

  it("app.: `/` e as telas pedem login; a API sem sessão é 401", async () => {
    for (const caminho of ["/", "/home", "/admin", "/vagas"]) {
      expect(caminhoDoLogin(await visitar("app.useconnect.com.br", caminho)), caminho).toBe("/login");
    }
    expect((await visitar("app.useconnect.com.br", "/api/qualquer")).status).toBe(401);
  });

  it("app.: com sessão, a identidade segue como sempre", async () => {
    const res = await visitar("app.useconnect.com.br", "/home", { sessao: true });
    expect(passou(res)).toBe(true);
    expect(cabecalho(res, "x-tenant-id")).toBe("t-41");
    expect(reescrito(res)).toBeNull();
  });

  // Já foram compartilhados: seguem abrindo no endereço do Connect.
  it("app.: os links antigos das vagas continuam servidos ali, sem redirect", async () => {
    for (const caminho of ["/carreiras/41tech/v1", "/carreiras/41tech", "/carreiras/outro/v9", "/carreiras/41tech/minha-conta/entrar?t=ab"]) {
      const res = await visitar("app.useconnect.com.br", caminho);
      expect(passou(res), caminho).toBe(true);
      expect(destino(res), caminho).toBeNull();
      expect(reescrito(res), caminho).toBeNull();
    }
    const candidatura = await visitar("app.useconnect.com.br", "/api/carreiras/apply", { metodo: "POST" });
    expect(passou(candidatura)).toBe(true);
  });

  it("o site (domínio principal e www.) segue na `/`", async () => {
    for (const host of ["useconnect.com.br", "www.useconnect.com.br"]) {
      const res = await visitar(host, "/");
      expect(passou(res), host).toBe(true);
      expect(reescrito(res), host).toBeNull();
    }
    expect(caminhoDoLogin(await visitar("useconnect.com.br", "/home"))).toBe("/login");
  });

  it("os setores seguem: login sem sessão, setor pelo subdomínio com sessão", async () => {
    expect(caminhoDoLogin(await visitar("bpo.useconnect.com.br", "/"))).toBe("/login");
    const res = await visitar("bpo.useconnect.com.br", "/home", { sessao: true });
    expect(cabecalho(res, "x-active-sector")).toBe("bpo");
  });
});

describe("no endereço do 41 Carreiras", () => {
  beforeEach(ligarOPortal);

  it("a `/` é o hub da 41, com a busca e os filtros na URL", async () => {
    const res = await visitar(PRINCIPAL, "/?q=fiscal&cidade=Curitiba");
    const para = reescrito(res)!;
    expect(para.pathname).toBe("/carreiras/41tech");
    expect(para.searchParams.get("q")).toBe("fiscal");
    expect(para.searchParams.get("cidade")).toBe("Curitiba");
    expect(destino(res)).toBeNull();
  });

  it("a vaga e a conta do candidato são as páginas do escritório da 41", async () => {
    expect(reescrito(await visitar(PRINCIPAL, "/vagas/6f1c2a"))!.pathname).toBe("/carreiras/41tech/6f1c2a");
    expect(reescrito(await visitar(PRINCIPAL, "/minha-conta"))!.pathname).toBe("/carreiras/41tech/minha-conta");
    const entrar = reescrito(await visitar(PRINCIPAL, "/minha-conta/entrar?t=abc"))!;
    expect(entrar.pathname).toBe("/carreiras/41tech/minha-conta/entrar");
    expect(entrar.searchParams.get("t")).toBe("abc");
    // As ações da conta (POST na própria página) vão para o mesmo lugar.
    expect(reescrito(await visitar(PRINCIPAL, "/minha-conta", { metodo: "POST" }))!.pathname).toBe("/carreiras/41tech/minha-conta");
  });

  it("CARREIRAS_TENANT_SLUG troca o escritório do hub", async () => {
    process.env.CARREIRAS_TENANT_SLUG = "41contabil";
    expect(reescrito(await visitar(PRINCIPAL, "/"))!.pathname).toBe("/carreiras/41contabil");
  });

  it("a candidatura e o logo passam como estão", async () => {
    expect(passou(await visitar(PRINCIPAL, "/api/carreiras/apply", { metodo: "POST" }))).toBe(true);
    expect(passou(await visitar(PRINCIPAL, "/api/workspace-logos/t-41.png?v=1"))).toBe(true);
  });

  it("robots.txt e sitemap.xml são os do portal", async () => {
    expect(reescrito(await visitar(PRINCIPAL, "/robots.txt"))!.pathname).toBe("/api/carreiras/robots");
    expect(reescrito(await visitar(PRINCIPAL, "/sitemap.xml"))!.pathname).toBe("/api/carreiras/sitemap");
  });

  it("os endereços antigos da 41 viram os curtos, no mesmo host", async () => {
    const vaga = await visitar(PRINCIPAL, "/carreiras/41tech/v1");
    expect(vaga.status).toBe(308);
    expect(destino(vaga)).toBe(`https://${PRINCIPAL}/vagas/v1`);
    const entrar = await visitar(PRINCIPAL, "/carreiras/41tech/minha-conta/entrar?t=abc");
    expect(destino(entrar)).toBe(`https://${PRINCIPAL}/minha-conta/entrar?t=abc`);
    expect(destino(await visitar(PRINCIPAL, "/carreiras"))).toBe(`https://${PRINCIPAL}/`);
  });

  it("nunca serve a equipe, o Portal do Cliente nem outro escritório — nem com sessão", async () => {
    const fechadas = ["/login", "/home", "/admin", "/empresas", "/portal", "/portal/login", "/sobre", "/carreiras/outro", "/carreiras/outro/v1", "/teste/tk", "/manifest.webmanifest"];
    for (const caminho of fechadas) {
      for (const sessao of [false, true]) {
        const res = await visitar(PRINCIPAL, caminho, { sessao });
        expect(res.status, caminho).toBe(404);
        expect(res.headers.get("content-type"), caminho).toContain("text/html");
        expect(passou(res), caminho).toBe(false);
        expect(reescrito(res), caminho).toBeNull();
        expect(destino(res), caminho).toBeNull();
      }
    }
    const pagina = await (await visitar(PRINCIPAL, "/login")).text();
    expect(pagina).toContain("41 Carreiras");
    expect(pagina).not.toMatch(/connect/i);
  });

  it("as APIs da equipe respondem 404, sem tentar sessão", async () => {
    for (const caminho of ["/api/auth/login", "/api/auth/refresh", "/api/qualquer", "/api/cron/alerts"]) {
      const res = await visitar(PRINCIPAL, caminho, { metodo: "POST", sessao: true });
      expect(res.status, caminho).toBe(404);
      expect(await res.json()).toEqual({ error: "Não encontrado" });
    }
  });

  it("cabeçalhos de identidade forjados saem, e nenhum é posto", async () => {
    const res = await visitar(PRINCIPAL, "/vagas/v1", {
      sessao: true,
      cabecalhos: { "x-tenant-id": "outro", "x-user-role": "SUPER_ADMIN", "x-active-sector": "bpo" },
    });
    expect(reescrito(res)!.pathname).toBe("/carreiras/41tech/v1");
    for (const nome of ["x-user-id", "x-tenant-id", "x-user-role", "x-active-sector"]) expect(cabecalho(res, nome), nome).toBeNull();
  });
});

describe("endereço provisório → principal", () => {
  beforeEach(ligarOPortal);

  it("GET no provisório vai para o principal, mesmo caminho e busca (308)", async () => {
    for (const caminho of ["/", "/vagas/v1", "/minha-conta/entrar?t=abc", "/?q=fiscal", "/login"]) {
      const res = await visitar(PROVISORIO, caminho);
      expect(res.status, caminho).toBe(308);
      expect(destino(res), caminho).toBe(`https://${PRINCIPAL}${caminho}`);
    }
  });

  it("POST e API não são redirecionados: são atendidos onde chegaram", async () => {
    expect(passou(await visitar(PROVISORIO, "/api/carreiras/apply", { metodo: "POST" }))).toBe(true);
    expect(reescrito(await visitar(PROVISORIO, "/minha-conta", { metodo: "POST" }))!.pathname).toBe("/carreiras/41tech/minha-conta");
    expect((await visitar(PROVISORIO, "/api/qualquer")).status).toBe(404);
  });

  it("hoje, só com o provisório configurado, ele é o principal: nada de redirect", async () => {
    process.env.CARREIRAS_HOSTS = PROVISORIO;
    delete process.env.CARREIRAS_HOST_PRINCIPAL;
    const res = await visitar(PROVISORIO, "/vagas/v1");
    expect(destino(res)).toBeNull();
    expect(reescrito(res)!.pathname).toBe("/carreiras/41tech/v1");
    // E o endereço da 41, sem estar na lista, é um host qualquer (o Connect não o atende).
    expect(reescrito(await visitar(PRINCIPAL, "/"))).toBeNull();
  });

  it("trocar o principal é só configuração: invertido, o redirect inverte", async () => {
    process.env.CARREIRAS_HOST_PRINCIPAL = PROVISORIO;
    expect(destino(await visitar(PRINCIPAL, "/vagas/v1"))).toBe(`https://${PROVISORIO}/vagas/v1`);
    expect(reescrito(await visitar(PROVISORIO, "/vagas/v1"))!.pathname).toBe("/carreiras/41tech/v1");
  });
});

describe("configuração errada não derruba o Connect", () => {
  it("o app. na lista de endereços do portal é ignorado", async () => {
    process.env.CARREIRAS_HOSTS = `app.useconnect.com.br,useconnect.com.br,${PROVISORIO}`;
    expect(caminhoDoLogin(await visitar("app.useconnect.com.br", "/"))).toBe("/login");
    expect(passou(await visitar("useconnect.com.br", "/"))).toBe(true);
    expect(reescrito(await visitar(PROVISORIO, "/"))!.pathname).toBe("/carreiras/41tech");
  });

  it("slug inválido fecha o portal (404) em vez de montar caminho com ele ou abrir o Connect", async () => {
    ligarOPortal();
    process.env.CARREIRAS_TENANT_SLUG = "../admin";
    for (const caminho of ["/", "/vagas/v1", "/login"]) {
      const res = await visitar(PRINCIPAL, caminho);
      expect(res.status, caminho).toBe(404);
      expect(reescrito(res), caminho).toBeNull();
    }
  });
});
