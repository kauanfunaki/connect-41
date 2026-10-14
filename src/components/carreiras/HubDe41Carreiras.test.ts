import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// O hub do 41 Carreiras sem navegador (regra do Kauan): a estrutura conferida
// no HTML — a marca da 41 (sem nada do Connect), as vagas com o que o
// candidato quer saber, os links curtos do endereço próprio, a busca por GET e
// o vazio.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { portalNoHost, configDeCarreiras } from "@/lib/carreiras/enderecoDeCarreiras";
import { lerFiltros } from "@/lib/carreiras/portal";
import type { VagaAberta } from "@/lib/carreiras/vagasDoPortal";
import { HubDe41Carreiras } from "./HubDe41Carreiras";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const PRINCIPAL = "carreiras.41contabil.com.br";
const config = configDeCarreiras({ CARREIRAS_HOSTS: PRINCIPAL });
const AGORA = new Date("2026-10-14T15:00:00Z");

function vaga(p: Partial<VagaAberta> & { id: string }): VagaAberta {
  return {
    title: "Analista Fiscal",
    quantity: 1,
    openedAt: new Date("2026-10-11T15:00:00Z"),
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
    empresa: "Metalúrgica Iguaçu",
    cidade: "Curitiba",
    uf: "PR",
    area: "Fiscal",
    ...p,
  };
}

function hub(host: string, vagas: VagaAberta[], logo: string | null = null, busca: Record<string, string> = {}) {
  const portal = portalNoHost("41tech", host, config)!;
  return renderToStaticMarkup(
    React.createElement(HubDe41Carreiras, {
      logo,
      rotas: portal.rotas,
      todas: vagas,
      vagas,
      filtradas: vagas.length,
      filtros: lerFiltros(busca),
      pagina: 1,
      totalDePaginas: 1,
      agora: AGORA,
    })
  );
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);

const VAGAS = [
  vaga({ id: "v1" }),
  vaga({
    id: "v2",
    title: "Auxiliar de DP",
    empresa: "Comercial Norte",
    cidade: "Joinville",
    uf: "SC",
    area: "Departamento Pessoal",
    workMode: "PRESENCIAL",
    openedAt: new Date("2026-10-14T13:00:00Z"),
    applicationDeadline: new Date("2026-10-31T00:00:00Z"),
  }),
];

describe("hub do 41 Carreiras", () => {
  it("a marca é a da 41: o nome, o rodapé da 41 Contábil — e nada do Connect nem da Lígia", () => {
    const html = hub(PRINCIPAL, VAGAS);
    expect(html).toContain(">Carreiras<");
    expect(html).toContain('aria-label="41 Carreiras: vagas abertas"');
    expect(html).toContain("41 Contábil");
    expect(html).not.toMatch(/connect|lígia|ligia/i);
    expect(html).not.toContain("/brand/");
  });

  it("com o logo do escritório, ele vem no topo, com o nome inteiro", () => {
    const html = hub(PRINCIPAL, VAGAS, "/api/workspace-logos/t-41.png?v=1");
    expect(html).toContain('src="/api/workspace-logos/t-41.png?v=1"');
    expect(html).toContain(">41 Carreiras<");
  });

  it("cada vaga: título, empresa, cidade/UF, modelo, contrato e há quanto tempo — com o link curto", () => {
    const html = hub(PRINCIPAL, VAGAS);
    for (const texto of ["Analista Fiscal", "Metalúrgica Iguaçu", "Curitiba – PR", "Híbrido", "CLT", "Publicada há 3 dias"]) {
      expect(html, texto).toContain(texto);
    }
    expect(html).toContain("Publicada hoje · inscrições até 31/10/2026");
    expect(hrefs(html)).toEqual(expect.arrayContaining(["/vagas/v1", "/vagas/v2", "/minha-conta", "/"]));
    expect(hrefs(html).some((h) => h.startsWith("/carreiras"))).toBe(false);
  });

  it("no endereço do Connect, a mesma página com os links de sempre", () => {
    const html = hub("app.useconnect.com.br", VAGAS);
    expect(hrefs(html)).toEqual(expect.arrayContaining(["/carreiras/41tech/v1", "/carreiras/41tech/minha-conta", "/carreiras/41tech"]));
  });

  it("a busca é um formulário GET para a própria lista, com os filtros que separam algo", () => {
    const html = hub(PRINCIPAL, VAGAS, null, { cidade: "Curitiba" });
    const form = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/"');
    expect(form).toContain('name="q"');
    for (const nome of ["cidade", "uf", "modalidade", "area"]) expect(form, nome).toContain(`name="${nome}"`);
    // Um contrato só (CLT) não separa nada: o filtro não aparece.
    expect(form).not.toContain('name="contrato"');
    expect(html).toContain("Limpar filtros");
  });

  it("sem vagas: o aviso de voltar em breve, sem busca", () => {
    const html = hub(PRINCIPAL, []);
    expect(html).toContain("Nenhuma vaga aberta agora");
    expect(html).toContain("Volte em breve");
    expect(html).not.toContain("<form");
  });
});
