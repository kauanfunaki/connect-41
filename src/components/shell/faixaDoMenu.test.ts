import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A faixa de ícones do menu recolhido (14/10/2026). Sem navegador, o HTML do
// servidor — que é o da primeira pintura, com o cookie lido no layout: os
// itens só com ícone e com nome para o leitor de tela, o ativo igual ao da
// coluna aberta, os fios entre os blocos, o setor no topo e a faixa no Tab.

const rota = vi.hoisted(() => ({ atual: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => rota.atual,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell } from "./AppShell";
import { classeDoItem, GrupoNavItem, NavItem, ProvedorDaFaixa } from "./NavLink";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  rota.atual = "/home";
});

const DP = { code: "dp", label: "DP", color: "#7C5CBF" };
const FISCAL = { code: "fiscal", label: "Fiscal", color: "#C5374B" };

type Props = React.ComponentProps<typeof AppShell>;

function casco(recolhido: boolean, extra: Partial<Props> = {}): string {
  const props: Props = {
    tenantId: "t1",
    accessibleTenants: [{ id: "t1", name: "41 Contábil", logoUrl: null }],
    sectors: [DP, FISCAL],
    activeSector: DP,
    activeSectorModules: [
      { code: "dp_folha", label: "Folha", href: "/dp/folha" },
      { code: "dp_ferias", label: "Férias", href: "/dp/ferias" },
    ],
    telasNavegaveis: [],
    telasFixadas: [{ code: "fiscal_apuracao", label: "Apuração", href: "/fiscal/apuracao", setor: "Fiscal" }],
    appDomain: null,
    sectorHostSuffix: "",
    canOpenAdmin: true,
    unreadCount: 0,
    profileName: "Kauan",
    profileRoleLabel: "Administrador",
    profilePhotoUrl: null,
    menuRecolhidoInicial: recolhido,
    children: React.createElement("p", null, "conteúdo"),
    ...extra,
  };
  return renderToStaticMarkup(React.createElement(AppShell, props));
}

/** Do `<aside` ao `</aside>`. */
function lateral(html: string): string {
  const inicio = html.indexOf("<aside");
  expect(inicio).toBeGreaterThanOrEqual(0);
  return html.slice(inicio, html.indexOf("</aside>", inicio) + "</aside>".length);
}

/** A tag de abertura do primeiro elemento com este `aria-label`. */
function tagCom(html: string, rotulo: string): string {
  const m = new RegExp(`<(a|button|span)[^>]*aria-label="${rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`).exec(html);
  expect(m, `elemento "${rotulo}"`).not.toBeNull();
  return m![0];
}

/** Os links do menu: tag de abertura e o texto visível de dentro (sem as tags). */
function linksDoMenu(html: string): { tag: string; texto: string }[] {
  const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
  return [...nav.matchAll(/(<a [^>]*>)([\s\S]*?)<\/a>/g)].map((m) => ({ tag: m[1]!, texto: m[2]!.replace(/<[^>]+>/g, "").trim() }));
}

describe("menu recolhido: a faixa de ícones", () => {
  it("a lateral fica na tela e no Tab — sem `inert`, sem esconder do leitor de tela", () => {
    const aside = lateral(casco(true));
    const abertura = /<aside[^>]*>/.exec(aside)![0];
    expect(abertura).not.toMatch(/\sinert/);
    expect(abertura).not.toContain("aria-hidden");
    expect(abertura).toContain("lg:w-16");
    expect(aside).not.toContain('tabindex="-1"');
  });

  it("cada item é só o ícone, com o nome no aria-label e na dica à direita", () => {
    const links = linksDoMenu(lateral(casco(true)));
    expect(links.map((l) => /aria-label="([^"]*)"/.exec(l.tag)?.[1])).toEqual(["Início", "Meu dia", "Quadros", "Cadastros", "Transferências", "Agenda", "Apuração", "Folha", "Férias"]);
    for (const l of links) {
      expect(l.texto).toBe("");
      const nome = /aria-label="([^"]*)"/.exec(l.tag)![1];
      expect(l.tag).toContain(`data-dica="${nome}"`);
      expect(l.tag).toContain('data-dica-lado="direita"');
    }
  });

  it("o ativo tem o mesmo desenho da coluna aberta (azul cheio, ícone branco)", () => {
    rota.atual = "/tarefas";
    const aside = lateral(casco(true));
    const ativo = tagCom(aside, "Meu dia");
    expect(ativo).toContain('aria-current="page"');
    expect(ativo).toContain("text-on-brand bg-brand-solid");
    // As mesmas classes do ativo da coluna aberta.
    expect(classeDoItem(true)).toContain("text-on-brand bg-brand-solid");
    const outro = tagCom(aside, "Início");
    expect(outro).not.toContain("aria-current");
    expect(outro).not.toContain("bg-brand-solid");
  });

  it("os títulos dos blocos viram fios — e o nome fica só para o leitor de tela", () => {
    const aside = lateral(casco(true));
    expect(aside).not.toContain("c41-rotulo");
    expect(aside.match(/data-separador/g)).toHaveLength(3); // Geral, Fixadas, DP
    for (const nome of ["Geral", "Fixadas", "DP"]) expect(aside).toContain(`<p class="sr-only">${nome}</p>`);
  });

  it("item com telas dentro (Cadastros) ganha o pontinho; os outros não", () => {
    const aside = lateral(casco(true));
    const cadastros = aside.slice(aside.indexOf('aria-label="Cadastros"'));
    expect(cadastros.slice(0, cadastros.indexOf("</a>"))).toContain('data-marca="telas"');
    const inicio = aside.slice(aside.indexOf('aria-label="Início"'));
    expect(inicio.slice(0, inicio.indexOf("</a>"))).not.toContain('data-marca="telas"');
  });

  it("no topo, o setor ativo com a bolinha da cor dele; o clique abre a troca de setor", () => {
    const aside = lateral(casco(true));
    expect(aside).not.toContain("logo-horizontal");
    const setor = tagCom(aside, "Setor DP. Trocar setor ou escritório");
    expect(setor).toMatch(/^<button/);
    expect(setor).toContain('data-dica="DP\nTrocar setor ou escritório"');
    expect(aside).toMatch(/data-marca="cor-do-setor"[^>]*style="background-color:#7C5CBF"/);
  });

  it("sem nada para trocar, o setor só aparece (não é botão)", () => {
    const aside = lateral(casco(true, { sectors: [DP] }));
    expect(tagCom(aside, "Setor DP")).toMatch(/^<span role="img"/);
  });

  it("a busca vira a lupa, com o atalho na dica", () => {
    const aside = lateral(casco(true));
    const lupa = tagCom(aside, "Buscar empresas, pessoas, telas…");
    expect(lupa).toMatch(/^<button/);
    expect(lupa).toContain('data-dica="Buscar (Ctrl K)"');
    expect(aside).not.toContain('placeholder="Buscar…"');
  });

  it("em Todos os setores, cada setor é o ícone com a bolinha da cor", () => {
    const aside = lateral(casco(true, { activeSector: null, activeSectorModules: [] }));
    expect(tagCom(aside, "Todos os setores. Trocar setor ou escritório")).toMatch(/^<button/);
    const fiscal = aside.slice(aside.indexOf('aria-label="Fiscal"'));
    expect(fiscal.slice(0, fiscal.indexOf("</button>"))).toContain('style="background:#C5374B"');
    // "Geral" abre a lista: sem fio em cima; "Fixadas" e "Meus Setores" com.
    expect(aside.match(/<span aria-hidden="true" class="block ml-2 w-6 h-px bg-border">/g)).toHaveLength(2);
  });

  it("a busca do topo continua só no celular (no computador, a lupa da faixa)", () => {
    const html = casco(true);
    const topo = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(topo).toContain('class="flex-1 min-w-0 lg:hidden"');
  });
});

describe("menu aberto: igual a antes", () => {
  it("a coluna de 240px com a logo, a busca, os títulos e os nomes à vista", () => {
    rota.atual = "/tarefas";
    const aside = lateral(casco(false));
    const abertura = /<aside[^>]*>/.exec(aside)![0];
    expect(abertura).toContain("w-[240px]");
    expect(abertura).not.toContain("lg:w-16");
    expect(abertura).not.toMatch(/\sinert/);
    expect(aside).toContain("logo-horizontal");
    expect(aside).toContain('placeholder="Buscar…"');
    expect(aside).toContain("c41-rotulo");
    expect(aside).not.toContain("data-separador");
    expect(aside).not.toContain("data-dica-lado");
    const links = linksDoMenu(aside);
    expect(links.find((l) => l.texto === "Meu dia")?.tag).toContain('aria-current="page"');
  });

  it("a gaveta do celular é a mesma marcação: fora da tela até abrir, com o fechar", () => {
    const aside = lateral(casco(false));
    expect(/<aside[^>]*>/.exec(aside)![0]).toContain("-translate-x-full");
    expect(aside).toContain('aria-label="Fechar menu"');
  });
});

describe("os itens na faixa, um a um", () => {
  const naFaixa = (filho: React.ReactElement) => renderToStaticMarkup(React.createElement(ProvedorDaFaixa, { value: true }, filho));

  it("o grupo leva a contagem para o nome e ganha o pontinho", () => {
    rota.atual = "/pagar";
    const html = naFaixa(
      React.createElement(GrupoNavItem, {
        label: "Contas",
        href: "/setor/bpo/grupo/contas",
        icon: React.createElement("svg"),
        itens: [
          { code: "bpo_pagar", label: "Contas a pagar", href: "/pagar" },
          { code: "bpo_receber", label: "Contas a receber", href: "/receber" },
        ],
      })
    );
    expect(html).toContain('aria-label="Contas, 2 telas"');
    expect(html).toContain('data-dica="Contas · 2 telas"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-marca="telas"');
    expect(html.replace(/<[^>]+>/g, "")).toBe("");
  });

  it("um item de uma tela só não tem o pontinho; com `comTelas`, tem", () => {
    const simples = naFaixa(React.createElement(NavItem, { href: "/agenda", icon: React.createElement("svg"), label: "Agenda" }));
    expect(simples).not.toContain("data-marca");
    const painel = naFaixa(React.createElement(NavItem, { href: "/gestao", icon: React.createElement("svg"), label: "Painel de Gestão", comTelas: true }));
    expect(painel).toContain('data-marca="telas"');
  });

  it("fora da faixa, o item é o de sempre, com o nome à vista", () => {
    const html = renderToStaticMarkup(React.createElement(NavItem, { href: "/agenda", icon: React.createElement("svg"), label: "Agenda" }));
    expect(html).not.toContain("aria-label");
    expect(html.replace(/<[^>]+>/g, "")).toBe("Agenda");
  });
});
