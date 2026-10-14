import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// As páginas do 41 Carreiras sem navegador (regra do Kauan): a estrutura
// conferida no HTML — a marca da 41 Tallent (e nada do Connect), a busca por
// GET, os números de verdade, os cartões com os links certos, a vaga com os
// fatos que existem, os requisitos, o compartilhar e a candidatura com o
// campo-armadilha de sempre.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
}));
vi.mock("next/image", () => ({
  default: (p: { src: string | { src: string }; alt: string }) =>
    React.createElement("img", { src: typeof p.src === "string" ? p.src : p.src.src, alt: p.alt }),
}));
vi.mock("./fontes", () => ({ fonteDosTitulos: { variable: "fonte-titulo" }, fonteDoTexto: { variable: "fonte-texto" } }));
vi.mock("@/app/carreiras/[slug]/minha-conta/actions", () => ({
  pedirLink: async () => null,
  entrarComLink: async () => null,
  sair: async () => {},
  desistir: async () => null,
  atualizarDados: async () => null,
  pedirExclusao: async () => null,
}));

import { configDeCarreiras, portalNoHost } from "@/lib/carreiras/enderecoDeCarreiras";
import { listaDoPortal } from "@/lib/carreiras/apresentacao";
import type { VagaAberta, VagaDetalhada } from "@/lib/carreiras/vagasDoPortal";
import { Capa41 } from "./Capa41";
import { Lista41 } from "./Lista41";
import { PaginaDaVaga41 } from "./PaginaDaVaga41";
import { Privacidade41 } from "./Privacidade41";
import { NaoEncontrada41 } from "./NaoEncontrada41";
import { AcessoAConta41 } from "./Conta41";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const PRINCIPAL = "carreiras.41contabil.com.br";
const config = configDeCarreiras({ CARREIRAS_HOSTS: PRINCIPAL });
const AGORA = new Date("2026-10-15T15:00:00Z");
const rotasNoPortal = portalNoHost("41tech", PRINCIPAL, config)!.rotas;
const rotasNoConnect = portalNoHost("41tech", "app.useconnect.com.br", config)!.rotas;

function vaga(p: Partial<VagaAberta> & { id: string }): VagaAberta {
  return {
    companyId: "c1",
    title: "Analista Fiscal",
    quantity: 1,
    openedAt: new Date("2026-10-12T15:00:00Z"),
    publicDescription: null,
    applicationDeadline: null,
    workCity: null,
    workStateCode: null,
    salaryMin: null,
    salaryMax: null,
    showSalary: false,
    workMode: "HIBRIDO",
    contractType: "CLT",
    company: { tradeName: "Metalúrgica Iguaçu", name: "Metalúrgica Iguaçu Ltda", city: "Curitiba", stateCode: "PR" },
    cargo: { name: "Fiscal" },
    temLogo: false,
    empresa: "Metalúrgica Iguaçu",
    cidade: "Curitiba",
    uf: "PR",
    area: "Fiscal",
    ...p,
  };
}

const VAGAS = [
  vaga({ id: "v1" }),
  vaga({
    id: "v2",
    companyId: "c2",
    title: "Auxiliar de DP",
    empresa: "Comercial Norte",
    cidade: "Joinville",
    uf: "SC",
    area: "Departamento Pessoal",
    workMode: "REMOTO",
    temLogo: true,
    openedAt: new Date("2026-10-14T13:00:00Z"),
    applicationDeadline: new Date("2026-10-20T00:00:00Z"),
  }),
];

function detalhe(p: Partial<VagaDetalhada> = {}): VagaDetalhada {
  return {
    ...vaga({ id: "v1" }),
    benefits: "Vale-refeição\n- Plano de saúde",
    publicDescription: "## Atividades\n- Apurar impostos\n- Conferir **notas fiscais**\n\nVenha <script>alert(1)</script> com a gente.",
    requisitos: { obrigatorios: ["Experiência com apuração de ICMS"], desejaveis: ["Conhecer o Domínio"] },
    ...p,
  } as VagaDetalhada;
}

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const hrefs = (h: string) => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
const SEM_CONNECT = /connect|\bceci\b|l[íi]gia/i;

describe("a capa", () => {
  const capa = html(React.createElement(Capa41, { slug: "41tech", rotas: rotasNoPortal, vagas: VAGAS, agora: AGORA }));

  it("a marca: 41 Carreiras, por 41 Tallent, quem conduz, o CNPJ e a política oficial — e nada do Connect", () => {
    expect(capa).toContain("41 Carreiras");
    expect(capa).toContain("por 41 Tallent");
    expect(capa).toContain("Processos seletivos conduzidos pela 41 Tallent.");
    expect(capa).toContain("41 Tallent · CNPJ 57.848.164/0001-90");
    expect(capa).toContain("uma empresa do grupo 41 Contábil");
    expect(hrefs(capa)).toContain("https://41contabil.com.br/41-tallent/politicas-e-termos/");
    expect(capa).not.toMatch(SEM_CONNECT);
    expect(capa).toContain('alt="41 Tallent"');
  });

  it("a busca grande é um GET para /vagas, com cargo e cidade", () => {
    const inicio = capa.indexOf('role="search"');
    expect(inicio).toBeGreaterThan(0);
    const form = capa.slice(capa.lastIndexOf("<form", inicio), capa.indexOf("</form>", inicio));
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/vagas"');
    expect(form).toContain('name="q"');
    expect(form).toContain('name="local"');
  });

  it("atalhos e áreas com as contagens de verdade; vagas recentes e empresas, com os links curtos", () => {
    const links = hrefs(capa);
    expect(links).toEqual(
      expect.arrayContaining([
        "/vagas?modalidade=HIBRIDO",
        "/vagas?modalidade=REMOTO",
        "/vagas?contrato=CLT",
        "/vagas?area=Fiscal",
        "/vagas?empresa=Comercial+Norte",
        "/vagas/v1",
        "/vagas/v2",
        "/vagas",
        "/minha-conta",
        "/privacidade",
      ]),
    );
    expect(links.some((h) => h.startsWith("/carreiras"))).toBe(false);
    // Os números: 2 vagas, 2 empresas, a mais nova de 14/10.
    expect(capa).toMatch(/t41-numero__valor[^>]*>2</);
    expect(capa).toContain(">14/10<");
    // Prazo a 5 dias: o selo.
    expect(capa).toContain("Inscrições até 20/10");
    // O logo da empresa só de quem tem, pela rota pública do portal.
    expect(capa).toContain('src="/api/carreiras/logo/41tech/v2"');
    expect(capa).not.toContain("/api/carreiras/logo/41tech/v1");
  });

  it("como funciona: quatro passos, sem promessa que o sistema não cumpre", () => {
    for (const passo of ["Encontre a vaga", "Candidate-se em poucos minutos", "Acompanhe pelo e-mail", "Entrevistas e testes na sua conta"]) {
      expect(capa, passo).toContain(passo);
    }
    expect(capa).not.toMatch(/verificad|nunca cobramos|taxa/i);
  });

  it("o acesso de quem já se candidatou: só o e-mail da inscrição", () => {
    expect(capa).toContain("E-mail usado na inscrição");
    expect(capa).toContain('type="email"');
  });

  it("sem vagas: nada de número zero, nem atalhos; o aviso de voltar em breve", () => {
    const vazia = html(React.createElement(Capa41, { slug: "41tech", rotas: rotasNoPortal, vagas: [], agora: AGORA }));
    expect(vazia).toContain("Nenhuma vaga aberta agora");
    expect(vazia).not.toContain("t41-numeros");
    expect(vazia).not.toContain("Atalhos");
    expect(vazia).not.toContain('id="empresas"');
  });
});

describe("a lista de vagas", () => {
  const lista = (busca: Record<string, string>, rotas = rotasNoPortal, d: VagaDetalhada | null = detalhe()) =>
    html(React.createElement(Lista41, { slug: "41tech", rotas, todas: VAGAS, lista: listaDoPortal(VAGAS, busca), detalhe: d, agora: AGORA }));

  it("cada cartão: no celular, a página da vaga; na tela larga, a vaga ao lado (na URL)", () => {
    const h = lista({});
    expect(hrefs(h)).toEqual(expect.arrayContaining(["/vagas/v1", "/vagas?vaga=v1", "/vagas/v2", "/vagas?vaga=v2"]));
    // A escolhida (sem `?vaga=`, a primeira: a mais recente) fica marcada.
    expect(h).toMatch(/<article class="t41-cartao t41-cartao--compacto" aria-current="true">[\s\S]*?Auxiliar de DP/);
  });

  it("o painel ao lado: candidatar-se leva ao formulário da página da vaga", () => {
    expect(hrefs(lista({ vaga: "v1" }))).toEqual(expect.arrayContaining(["/vagas/v1#candidatura"]));
  });

  it("busca e filtros: o formulário guarda os filtros escolhidos; a contagem e o limpar", () => {
    const h = lista({ q: "dp", modalidade: "REMOTO" });
    expect(h).toContain('<input type="hidden" name="modalidade" value="REMOTO"/>');
    expect(h).toContain("1 vaga</strong> de 2 abertas");
    expect(h).toContain("Limpar filtros");
    expect(h).toContain("Modelo: <span");
  });

  it("nada com esses filtros: a sugestão de limpar", () => {
    const h = lista({ local: "manaus" }, rotasNoPortal, null);
    expect(h).toContain("Nenhuma vaga com esses filtros");
    expect(hrefs(h)).toContain("/vagas");
  });

  it("no endereço do Connect, os links longos de sempre", () => {
    expect(hrefs(lista({}, rotasNoConnect))).toEqual(expect.arrayContaining(["/carreiras/41tech/v1", "/carreiras/41tech/vagas?vaga=v1"]));
  });
});

describe("a página da vaga", () => {
  const pagina = (d: VagaDetalhada, url: string | null = `https://${PRINCIPAL}/vagas/v1`) =>
    html(
      React.createElement(PaginaDaVaga41, {
        vaga: d,
        slug: "41tech",
        rotas: rotasNoPortal,
        agora: AGORA,
        carimbo: "123.assinatura",
        urlPublica: url,
        jsonLd: '{"@type":"JobPosting"}',
      }),
    );

  it("o topo: empresa, título, local, modelo, contrato e há quanto tempo", () => {
    const h = pagina(detalhe());
    expect(h).toContain(">Analista Fiscal</h1>");
    for (const t of ["Metalúrgica Iguaçu", "Curitiba – PR", "Híbrido", "CLT", "Publicada há 3 dias"]) expect(h, t).toContain(t);
    expect(h).toContain('<script type="application/ld+json">{"@type":"JobPosting"}</script>');
  });

  it("os fatos: só os que existem — salário só quando publicado", () => {
    expect(pagina(detalhe())).not.toContain("Faixa salarial");
    expect(pagina(detalhe({ salaryMin: 3000, salaryMax: 4500, showSalary: true }))).toContain("Faixa salarial");
    expect(pagina(detalhe({ salaryMin: 3000, salaryMax: 4500, showSalary: false }))).not.toContain("4.500");
  });

  it("a descrição formatada, sem HTML cru; requisitos e benefícios em listas", () => {
    const h = pagina(detalhe());
    expect(h).toContain("<h3>Atividades</h3>");
    expect(h).toContain("<li>Apurar impostos</li>");
    expect(h).toContain("<strong>notas fiscais</strong>");
    expect(h).not.toContain("<script>alert");
    expect(h).toContain("Obrigatórios");
    expect(h).toContain("Experiência com apuração de ICMS");
    expect(h).toContain("Desejáveis");
    expect(h).toContain("Plano de saúde");
    expect(h).toContain("Processo conduzido pela 41 Tallent");
  });

  it("sem requisitos nem benefícios, os blocos somem", () => {
    const h = pagina(detalhe({ benefits: null, requisitos: { obrigatorios: [], desejaveis: [] }, publicDescription: null }));
    expect(h).not.toContain("Requisitos");
    expect(h).not.toContain("Benefícios");
    expect(h).not.toContain("Sobre a vaga");
  });

  it("a candidatura: os quatro passos, o campo-armadilha e a autorização de sempre", () => {
    const h = pagina(detalhe());
    for (const p of ["Seus dados", "Currículo", "Perguntas", "Revisão"]) expect(h, p).toContain(p);
    expect(h).toContain('name="website"');
    expect(h).toContain('tabindex="-1"');
    expect(h).toContain("Autorizo o uso dos meus dados pessoais para participação neste processo seletivo (LGPD).");
    expect(hrefs(h)).toEqual(expect.arrayContaining(["https://41contabil.com.br/41-tallent/politicas-e-termos/", "/privacidade"]));
    for (const campo of ["name", "email", "phone", "city", "pretensaoSalarial", "deslocamentoMinutos"]) expect(h, campo).toContain(`name="${campo}"`);
  });

  it("compartilhar: LinkedIn e WhatsApp com o endereço canônico; sem endereço público, sem compartilhar", () => {
    const links = hrefs(pagina(detalhe()));
    expect(links).toContain("https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fcarreiras.41contabil.com.br%2Fvagas%2Fv1");
    expect(links.some((l) => l.startsWith("https://wa.me/?text="))).toBe(true);
    expect(pagina(detalhe(), null)).not.toContain("linkedin.com");
  });

  it("nada do Connect na página", () => {
    expect(pagina(detalhe())).not.toMatch(SEM_CONNECT);
  });
});

describe("as outras páginas", () => {
  it("seus dados no portal: um resumo que aponta para a política oficial da 41 Tallent", () => {
    const h = html(React.createElement(Privacidade41, { rotas: rotasNoPortal }));
    for (const t of ["41 Tallent", "Nome completo e e-mail", "currículo em PDF", "inteligência artificial", "30 minutos", "7 dias", "exclusão", "privacidade@41contabil.com.br"]) {
      expect(h, t).toContain(t);
    }
    expect(hrefs(h)).toContain("https://41contabil.com.br/41-tallent/politicas-e-termos/");
    expect(h).not.toMatch(SEM_CONNECT);
  });

  it("vaga não encontrada: a busca e o caminho para as vagas abertas", () => {
    const h = html(React.createElement(NaoEncontrada41, { rotas: rotasNoPortal }));
    expect(h).toContain('action="/vagas"');
    expect(h).toContain("Ver vagas abertas");
  });

  it("acesso à conta: só o e-mail da inscrição; com o link, o botão de entrar", () => {
    const pedir = html(React.createElement(AcessoAConta41, { slug: "41tech", rotas: rotasNoPortal }));
    expect(pedir).toContain("E-mail usado na inscrição");
    expect(pedir).not.toMatch(/senha"|type="password"/);
    const entrar = html(React.createElement(AcessoAConta41, { slug: "41tech", rotas: rotasNoPortal, token: "a".repeat(64) }));
    expect(entrar).toContain("Entrar e ver minhas candidaturas");
  });
});
