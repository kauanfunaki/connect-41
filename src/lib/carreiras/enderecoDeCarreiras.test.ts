import { describe, expect, it } from "vitest";
import {
  MARCA_41_CARREIRAS,
  PAGINA_NAO_ENCONTRADA,
  caminhoDoLogoDaVaga,
  caminhoNoPortal,
  configDeCarreiras,
  ehDa41,
  ehHostDeCarreiras,
  enderecoPublicoDoPortal,
  imagemDeCompartilhamento,
  nomeDoEscritorio,
  normalizarHost,
  portalNoHost,
  rotaNoHostDeCarreiras,
  rotuloDePublicarVaga,
  urlDaVagaNo41Carreiras,
  urlDoHub,
} from "./enderecoDeCarreiras";

// O 41 Carreiras (13/10/2026): o portal de vagas da 41 num endereço próprio,
// ligado por configuração. Sem as variáveis, nada liga.

const PRINCIPAL = "carreiras.41contabil.com.br";
const PROVISORIO = "carreiras.useconnect.com.br";

/** O ambiente de produção do Connect, com o portal configurado. */
const PRODUCAO = {
  APP_DOMAIN: "useconnect.com.br",
  APP_PUBLIC_URL: "https://app.useconnect.com.br",
  CARREIRAS_HOSTS: `${PRINCIPAL},${PROVISORIO}`,
  CARREIRAS_HOST_PRINCIPAL: PRINCIPAL,
};

describe("normalizarHost", () => {
  it("tira porta, caixa, ponto final, protocolo e caminho", () => {
    expect(normalizarHost("Carreiras.41Contabil.com.br:443")).toBe(PRINCIPAL);
    expect(normalizarHost("carreiras.41contabil.com.br.")).toBe(PRINCIPAL);
    expect(normalizarHost(" https://carreiras.41contabil.com.br/vagas?x=1 ")).toBe(PRINCIPAL);
  });

  it("recusa o que não é nome de host com domínio", () => {
    for (const v of [null, undefined, "", "  ", "localhost", "localhost:3000", "[::1]:3000", "carreiras .41.com", "-a.com"]) {
      expect(normalizarHost(v)).toBeNull();
    }
  });
});

describe("configDeCarreiras", () => {
  it("sem nenhuma variável, o portal fica desligado", () => {
    expect(configDeCarreiras({})).toBeNull();
    expect(configDeCarreiras({ APP_DOMAIN: "useconnect.com.br", CARREIRAS_TENANT_SLUG: "41tech" })).toBeNull();
    expect(configDeCarreiras({ CARREIRAS_HOSTS: " , ,localhost" })).toBeNull();
  });

  it("lê os endereços e o principal; o slug padrão é o da 41 (41tech)", () => {
    expect(configDeCarreiras(PRODUCAO)).toEqual({ hosts: [PRINCIPAL, PROVISORIO], principal: PRINCIPAL, tenantSlug: "41tech" });
  });

  it("hoje: só o provisório, que é o principal", () => {
    expect(configDeCarreiras({ CARREIRAS_HOSTS: PROVISORIO })).toEqual({ hosts: [PROVISORIO], principal: PROVISORIO, tenantSlug: "41tech" });
    expect(configDeCarreiras({ CARREIRAS_HOST_PRINCIPAL: PROVISORIO })).toEqual({ hosts: [PROVISORIO], principal: PROVISORIO, tenantSlug: "41tech" });
  });

  it("sem principal, vale o primeiro da lista; principal fora da lista entra nela", () => {
    expect(configDeCarreiras({ CARREIRAS_HOSTS: `${PROVISORIO},${PRINCIPAL}` })?.principal).toBe(PROVISORIO);
    expect(configDeCarreiras({ CARREIRAS_HOSTS: PROVISORIO, CARREIRAS_HOST_PRINCIPAL: PRINCIPAL })?.hosts).toEqual([PRINCIPAL, PROVISORIO]);
  });

  it("aceita valor colado com protocolo, maiúsculas e repetido", () => {
    expect(
      configDeCarreiras({ CARREIRAS_HOSTS: ` https://${PROVISORIO}/ , ${PROVISORIO.toUpperCase()} `, CARREIRAS_HOST_PRINCIPAL: `https://${PROVISORIO}` })
    ).toEqual({ hosts: [PROVISORIO], principal: PROVISORIO, tenantSlug: "41tech" });
  });

  it("CARREIRAS_TENANT_SLUG troca o escritório; fora do formato, o portal fecha", () => {
    expect(configDeCarreiras({ ...PRODUCAO, CARREIRAS_TENANT_SLUG: " 41Contabil " })?.tenantSlug).toBe("41contabil");
    for (const errado of ["../admin", "41 tech", "a/b"]) {
      const config = configDeCarreiras({ ...PRODUCAO, CARREIRAS_TENANT_SLUG: errado });
      // Os endereços continuam do portal (fora do Connect), sem escritório.
      expect(config).toEqual({ hosts: [PRINCIPAL, PROVISORIO], principal: PRINCIPAL, tenantSlug: null });
      expect(rotaNoHostDeCarreiras("/", config!.tenantSlug)).toEqual({ tipo: "nao-encontrada" });
      expect(ehDa41(errado, config)).toBe(false);
      expect(urlDoHub({ ...PRODUCAO, CARREIRAS_TENANT_SLUG: errado })).toBeNull();
    }
  });

  // Um erro de digitação aqui não pode transformar o Connect no portal.
  it("os endereços do próprio Connect nunca viram portal", () => {
    const proibidos = ["useconnect.com.br", "www.useconnect.com.br", "app.useconnect.com.br", "https://app.useconnect.com.br/"];
    expect(configDeCarreiras({ ...PRODUCAO, CARREIRAS_HOSTS: proibidos.join(","), CARREIRAS_HOST_PRINCIPAL: "" })).toBeNull();
    expect(configDeCarreiras({ ...PRODUCAO, CARREIRAS_HOST_PRINCIPAL: "app.useconnect.com.br" })?.principal).toBe(PRINCIPAL);
    // Com o sufixo de setor, o endereço neutro é appteste.
    expect(
      configDeCarreiras({ APP_DOMAIN: "useconnect.com.br", SECTOR_HOST_SUFFIX: "teste", CARREIRAS_HOSTS: "appteste.useconnect.com.br" })
    ).toBeNull();
  });
});

describe("ehHostDeCarreiras", () => {
  const config = configDeCarreiras(PRODUCAO);

  it("os dois endereços do portal, com porta e caixa quaisquer", () => {
    expect(ehHostDeCarreiras(PRINCIPAL, config)).toBe(true);
    expect(ehHostDeCarreiras("Carreiras.UseConnect.com.br:443", config)).toBe(true);
  });

  it("o Connect, o site, os setores e outros domínios não são", () => {
    for (const host of ["app.useconnect.com.br", "useconnect.com.br", "www.useconnect.com.br", "bpo.useconnect.com.br", "carreiras.outro.com.br", "localhost:3000", null, ""]) {
      expect(ehHostDeCarreiras(host, config)).toBe(false);
    }
  });

  it("com o portal desligado, nenhum host é", () => {
    expect(ehHostDeCarreiras(PROVISORIO, null)).toBe(false);
  });
});

describe("os caminhos do portal", () => {
  it("curtos no endereço do 41 Carreiras, longos no do Connect", () => {
    expect(caminhoNoPortal("41tech", { tipo: "lista" }, true)).toBe("/");
    expect(caminhoNoPortal("41tech", { tipo: "vaga", id: "v1" }, true)).toBe("/vagas/v1");
    expect(caminhoNoPortal("41tech", { tipo: "conta" }, true)).toBe("/minha-conta");
    expect(caminhoNoPortal("41tech", { tipo: "entrar", token: "ab" }, true)).toBe("/minha-conta/entrar?t=ab");
    expect(caminhoNoPortal("outro", { tipo: "lista" }, false)).toBe("/carreiras/outro");
    expect(caminhoNoPortal("outro", { tipo: "vaga", id: "v1" }, false)).toBe("/carreiras/outro/v1");
    expect(caminhoNoPortal("outro", { tipo: "conta" }, false)).toBe("/carreiras/outro/minha-conta");
    expect(caminhoNoPortal("outro", { tipo: "entrar" }, false)).toBe("/carreiras/outro/minha-conta/entrar");
  });

  it("a lista com filtros e o aviso de privacidade (15/10/2026)", () => {
    expect(caminhoNoPortal("41tech", { tipo: "vagas" }, true)).toBe("/vagas");
    expect(caminhoNoPortal("41tech", { tipo: "privacidade" }, true)).toBe("/privacidade");
    expect(caminhoNoPortal("41tech", { tipo: "vagas" }, false)).toBe("/carreiras/41tech/vagas");
    expect(caminhoNoPortal("41tech", { tipo: "privacidade" }, false)).toBe("/carreiras/41tech/privacidade");
  });

  it("o logo da empresa da vaga sai pela rota pública do portal, relativa", () => {
    expect(caminhoDoLogoDaVaga("41tech", "v1")).toBe("/api/carreiras/logo/41tech/v1");
  });
});

describe("imagemDeCompartilhamento — a prévia do link (LinkedIn, WhatsApp, Pandapé)", () => {
  it("da 41: no endereço principal do portal, a da capa e a de cada vaga", () => {
    expect(imagemDeCompartilhamento("41tech", null, PRODUCAO)).toBe(`https://${PRINCIPAL}/api/carreiras/og/41tech`);
    expect(imagemDeCompartilhamento("41tech", "v1", PRODUCAO)).toBe(`https://${PRINCIPAL}/api/carreiras/og/41tech/v1`);
  });

  it("dos outros escritórios, ou com o portal desligado: nenhuma", () => {
    expect(imagemDeCompartilhamento("outro", "v1", PRODUCAO)).toBeNull();
    expect(imagemDeCompartilhamento("41tech", "v1", { APP_PUBLIC_URL: "https://app.useconnect.com.br" })).toBeNull();
  });
});

describe("a marca", () => {
  it("o nome do portal num lugar só; quem conduz é a 41 Tallent, com o CNPJ dela e a política oficial", () => {
    expect(MARCA_41_CARREIRAS.nome).toBe("41 Carreiras");
    expect(MARCA_41_CARREIRAS.recrutamento).toBe("41 Tallent");
    expect(MARCA_41_CARREIRAS.cnpj).toBe("57.848.164/0001-90");
    expect(MARCA_41_CARREIRAS.politicaDePrivacidade).toBe("https://41contabil.com.br/41-tallent/politicas-e-termos/");
  });

  it("a página de não encontrada do proxy: a marca, a busca na lista e o caminho de volta", () => {
    expect(PAGINA_NAO_ENCONTRADA).toContain("<title>Página não encontrada · 41 Carreiras</title>");
    expect(PAGINA_NAO_ENCONTRADA).toContain('action="/vagas"');
    expect(PAGINA_NAO_ENCONTRADA).toContain('href="/vagas"');
    expect(PAGINA_NAO_ENCONTRADA).toContain('src="/41-tallent/marca.png"');
    expect(PAGINA_NAO_ENCONTRADA).not.toMatch(/connect/i);
  });
});

describe("enderecoPublicoDoPortal e os links da vaga", () => {
  it("da 41, com o portal configurado: o endereço principal do 41 Carreiras", () => {
    expect(enderecoPublicoDoPortal("41tech", { tipo: "vaga", id: "v1" }, PRODUCAO)).toBe(`https://${PRINCIPAL}/vagas/v1`);
    expect(enderecoPublicoDoPortal("41tech", { tipo: "lista" }, PRODUCAO)).toBe(`https://${PRINCIPAL}/`);
    expect(enderecoPublicoDoPortal("41tech", { tipo: "entrar", token: "ab" }, PRODUCAO)).toBe(`https://${PRINCIPAL}/minha-conta/entrar?t=ab`);
    expect(urlDaVagaNo41Carreiras("41tech", "v1", PRODUCAO)).toBe(`https://${PRINCIPAL}/vagas/v1`);
    expect(urlDoHub(PRODUCAO)).toBe(`https://${PRINCIPAL}/`);
  });

  it("dos outros escritórios: o endereço de sempre, em APP_PUBLIC_URL", () => {
    expect(enderecoPublicoDoPortal("outro", { tipo: "vaga", id: "v1" }, PRODUCAO)).toBe("https://app.useconnect.com.br/carreiras/outro/v1");
    expect(urlDaVagaNo41Carreiras("outro", "v1", PRODUCAO)).toBeNull();
  });

  it("sem o portal configurado: tudo como antes, inclusive para a 41", () => {
    const antes = { APP_PUBLIC_URL: "https://app.useconnect.com.br/" };
    expect(enderecoPublicoDoPortal("41tech", { tipo: "vaga", id: "v1" }, antes)).toBe("https://app.useconnect.com.br/carreiras/41tech/v1");
    expect(enderecoPublicoDoPortal("41tech", { tipo: "lista" }, antes)).toBe("https://app.useconnect.com.br/carreiras/41tech");
    expect(urlDaVagaNo41Carreiras("41tech", "v1", antes)).toBeNull();
    expect(urlDoHub(antes)).toBeNull();
    // Sem URL absoluta possível, nada (como `publicUrl`).
    expect(enderecoPublicoDoPortal("41tech", { tipo: "lista" }, {})).toBeNull();
  });
});

describe("rotuloDePublicarVaga — a caixa \"publicar\" do formulário da vaga", () => {
  it("da 41, com o portal configurado: o 41 Carreiras e o endereço principal", () => {
    expect(rotuloDePublicarVaga("41tech", PRODUCAO)).toBe(`Publicar no 41 Carreiras (${PRINCIPAL})`);
    // Enquanto o DNS da 41 não existe, o principal é o provisório do Connect.
    const provisorio = { ...PRODUCAO, CARREIRAS_HOSTS: PROVISORIO, CARREIRAS_HOST_PRINCIPAL: PROVISORIO };
    expect(rotuloDePublicarVaga("41tech", provisorio)).toBe("Publicar no 41 Carreiras (carreiras.useconnect.com.br)");
    // O slug da 41 vem da configuração.
    expect(rotuloDePublicarVaga("quarenta-e-um", { ...PRODUCAO, CARREIRAS_TENANT_SLUG: "quarenta-e-um" })).toContain("41 Carreiras");
  });

  it("dos outros escritórios, sem o portal ou sem slug: o portal de vagas do escritório", () => {
    const generico = "Publicar no portal de vagas do escritório";
    expect(rotuloDePublicarVaga("outro", PRODUCAO)).toBe(generico);
    expect(rotuloDePublicarVaga("41tech", { APP_PUBLIC_URL: "https://app.useconnect.com.br" })).toBe(generico);
    expect(rotuloDePublicarVaga(null, PRODUCAO)).toBe(generico);
    expect(rotuloDePublicarVaga(undefined, PRODUCAO)).toBe(generico);
  });
});

describe("portalNoHost — a página do portal vista do host", () => {
  const config = configDeCarreiras(PRODUCAO);

  it("a 41 no endereço do portal: marca da 41 e links curtos; o teste vai para o Connect", () => {
    const p = portalNoHost("41tech", PRINCIPAL, config, "https://app.useconnect.com.br")!;
    expect(p).toMatchObject({ da41: true, curto: true });
    expect(p.rotas.lista).toBe("/");
    expect(p.rotas.vagas).toBe("/vagas");
    expect(p.rotas.privacidade).toBe("/privacidade");
    expect(p.rotas.vaga("v1")).toBe("/vagas/v1");
    expect(p.rotas.conta).toBe("/minha-conta");
    expect(p.rotas.entrar).toBe("/minha-conta/entrar");
    expect(p.rotas.caminhoDoCookie).toBe("/minha-conta");
    expect(p.rotas.teste("tk")).toBe("https://app.useconnect.com.br/teste/tk");
  });

  it("a 41 no endereço do Connect: marca da 41, links de sempre", () => {
    const p = portalNoHost("41tech", "app.useconnect.com.br", config, "https://app.useconnect.com.br")!;
    expect(p).toMatchObject({ da41: true, curto: false });
    expect(p.rotas.vaga("v1")).toBe("/carreiras/41tech/v1");
    expect(p.rotas.vagas).toBe("/carreiras/41tech/vagas");
    expect(p.rotas.privacidade).toBe("/carreiras/41tech/privacidade");
    expect(p.rotas.caminhoDoCookie).toBe("/carreiras/41tech");
    expect(p.rotas.teste("tk")).toBe("/teste/tk");
  });

  it("outro escritório: igual a antes; no endereço do 41 Carreiras, não existe", () => {
    const p = portalNoHost("outro", "app.useconnect.com.br", config)!;
    expect(p).toMatchObject({ da41: false, curto: false });
    expect(p.rotas.lista).toBe("/carreiras/outro");
    expect(p.rotas.conta).toBe("/carreiras/outro/minha-conta");
    expect(p.rotas.caminhoDoCookie).toBe("/carreiras/outro");
    expect(portalNoHost("outro", PRINCIPAL, config)).toBeNull();
  });

  it("sem o portal configurado, ninguém é da 41", () => {
    expect(portalNoHost("41tech", PROVISORIO, null)).toMatchObject({ da41: false, curto: false });
    expect(ehDa41("41tech", null)).toBe(false);
  });

  it("o nome de quem conduz o processo: a 41 Tallent para a 41 (15/10/2026)", () => {
    expect(nomeDoEscritorio({ da41: true }, "41 Tech")).toBe("41 Tallent");
    expect(nomeDoEscritorio({ da41: false }, "Outro Escritório")).toBe("Outro Escritório");
  });
});

describe("rotaNoHostDeCarreiras — a lista fechada do endereço do portal", () => {
  const rota = (c: string) => rotaNoHostDeCarreiras(c, "41tech");

  it("a raiz é o hub; a vaga e a conta, as páginas do escritório da 41", () => {
    expect(rota("/")).toEqual({ tipo: "reescrever", para: "/carreiras/41tech" });
    expect(rota("/vagas/6f1c-2a")).toEqual({ tipo: "reescrever", para: "/carreiras/41tech/6f1c-2a" });
    expect(rota("/vagas/6f1c-2a/")).toEqual({ tipo: "reescrever", para: "/carreiras/41tech/6f1c-2a" });
    expect(rota("/minha-conta")).toEqual({ tipo: "reescrever", para: "/carreiras/41tech/minha-conta" });
    expect(rota("/minha-conta/entrar")).toEqual({ tipo: "reescrever", para: "/carreiras/41tech/minha-conta/entrar" });
    expect(rota("/robots.txt")).toEqual({ tipo: "reescrever", para: "/api/carreiras/robots" });
    expect(rota("/sitemap.xml")).toEqual({ tipo: "reescrever", para: "/api/carreiras/sitemap" });
  });

  it("a lista com busca e filtros e o aviso de privacidade (15/10/2026)", () => {
    expect(rota("/vagas")).toEqual({ tipo: "reescrever", para: "/carreiras/41tech/vagas" });
    expect(rota("/vagas/")).toEqual({ tipo: "reescrever", para: "/carreiras/41tech/vagas" });
    expect(rota("/privacidade")).toEqual({ tipo: "reescrever", para: "/carreiras/41tech/privacidade" });
  });

  it("a marca da 41 Tallent, as imagens de compartilhamento e o logo das empresas passam", () => {
    for (const c of [
      "/41-tallent/logo.png",
      "/41-tallent/marca.png",
      "/api/carreiras/og/41tech",
      "/api/carreiras/og/41tech/v1",
      "/api/carreiras/logo/41tech/v1",
    ]) {
      expect(rota(c), c).toEqual({ tipo: "seguir" });
    }
  });

  it("a candidatura, o logo do escritório e os arquivos do Next passam", () => {
    for (const c of ["/api/carreiras/apply", "/api/workspace-logos/t1.png", "/_next/data/x.json", "/icon.png", "/apple-icon.png"]) {
      expect(rota(c)).toEqual({ tipo: "seguir" });
    }
  });

  it("os endereços antigos da 41 viram os curtos", () => {
    expect(rota("/carreiras")).toEqual({ tipo: "redirecionar", para: "/" });
    expect(rota("/carreiras/41tech")).toEqual({ tipo: "redirecionar", para: "/" });
    expect(rota("/carreiras/41tech/v1")).toEqual({ tipo: "redirecionar", para: "/vagas/v1" });
    expect(rota("/carreiras/41tech/minha-conta")).toEqual({ tipo: "redirecionar", para: "/minha-conta" });
    expect(rota("/carreiras/41tech/minha-conta/entrar")).toEqual({ tipo: "redirecionar", para: "/minha-conta/entrar" });
    expect(rota("/carreiras/41tech/vagas")).toEqual({ tipo: "redirecionar", para: "/vagas" });
    expect(rota("/carreiras/41tech/privacidade")).toEqual({ tipo: "redirecionar", para: "/privacidade" });
  });

  it("nada da equipe, do Portal do Cliente nem de outro escritório", () => {
    const fechadas = [
      "/login",
      "/home",
      "/admin",
      "/admin/setores",
      "/empresas",
      "/vagas/v1/candidaturas",
      "/portal",
      "/portal/login",
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/qualquer",
      "/api/cron/alerts",
      "/sobre",
      "/d/token",
      "/admissao/token",
      "/teste/token",
      "/carreiras/outro",
      "/carreiras/outro/v1",
      "/carreiras/41tech/v1/x",
      "/minha-conta/x",
      "/vagas/a%2Fb",
      "/privacidade/x",
      "/41-tallent",
      "/carreiras/41tech/vagas/v1",
      "/vagas/..",
      "/manifest.webmanifest",
      "/sw.js",
      "/.well-known/assetlinks.json",
      "/brand/logo-horizontal-light.svg",
      "//vagas",
    ];
    for (const c of fechadas) expect(rota(c), c).toEqual({ tipo: "nao-encontrada" });
  });
});
