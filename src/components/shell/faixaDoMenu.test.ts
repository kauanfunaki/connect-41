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
import { ToastProvider } from "@/components/ui/Toast";
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
    // Duas telas reais do DP em temas diferentes (Pessoas e Jornada): pela regra
    // de 05/11/2026, grupo de uma tela só vira tela solta.
    activeSectorModules: [
      { code: "dp_colaboradores", label: "Colaboradores", href: "/admissoes" },
      { code: "dp_horas_extras", label: "Horas extras", href: "/horas-extras" },
    ],
    telasNavegaveis: [],
    telasFixadas: [{ code: "fiscal_apuracao", label: "Apuração", href: "/sped-fiscal/motor/apuracao", setor: "Fiscal" }],
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
  // Dentro do `ToastProvider`, como no layout do app: o sino avisa por toast
  // quando não consegue tirar uma notificação.
  return renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(AppShell, props)));
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

/** A tag de abertura do link cujo texto visível é este. */
function tagDoLink(html: string, texto: string): string {
  const l = linksDoMenu(html).find((x) => x.texto === texto);
  expect(l, `link "${texto}"`).toBeDefined();
  return l!.tag;
}

/** Os links do menu: tag de abertura e o texto visível de dentro (sem as tags). */
function linksDoMenu(html: string): { tag: string; texto: string }[] {
  const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
  return [...nav.matchAll(/(<a [^>]*>)([\s\S]*?)<\/a>/g)].map((m) => ({ tag: m[1]!, texto: m[2]!.replace(/<[^>]+>/g, "").trim() }));
}

describe("menu recolhido: a faixa de ícones", () => {
  // 05/11/2026: o SPED é a tela-mãe com as etapas recuadas embaixo (sem a
  // janela de antes); na faixa, a mãe com o pontinho de "tem telas dentro".
  it("reúne as áreas fiscais em um único item SPED, com as etapas embaixo; na faixa, só o SPED", () => {
    rota.atual = "/sped-fiscal/motor/entregas";
    const modulos = [
      { code: "fiscal_classificacao", label: "Classificação", href: "/sped-fiscal/motor/classificacao" },
      { code: "fiscal_entregas", label: "SPED gerados", href: "/sped-fiscal/motor/entregas" },
      { code: "fiscal_operacao", label: "Executar", href: "/sped-fiscal/motor/operacao" },
    ];
    const aberto = lateral(casco(false, { telasFixadas: [], activeSector: FISCAL, activeSectorModules: modulos }));
    expect(aberto).not.toContain('aria-haspopup="menu"');
    expect(tagDoLink(aberto, "SPED")).toContain('aria-current="page"');
    expect(aberto).toContain('data-recuado="true"');
    expect(aberto).not.toContain('href="/sped-fiscal/motor/operacao"');
    expect(aberto).not.toContain('href="/sped-fiscal/motor/entregas"');

    const faixa = lateral(casco(true, { telasFixadas: [], activeSector: FISCAL, activeSectorModules: modulos }));
    const sped = tagCom(faixa, "SPED");
    expect(sped).toContain('aria-current="page"');
    expect(faixa).not.toContain("data-recuado");
    expect(faixa).not.toContain('href="/sped-fiscal/motor/operacao"');
  });
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
    expect(links.map((l) => /aria-label="([^"]*)"/.exec(l.tag)?.[1])).toEqual(["Início", "Meu dia", "Quadros", "Cadastros", "Transferências", "Agenda", "Apuração", "Colaboradores", "Horas extras"]);
    for (const l of links) {
      expect(l.texto).toBe("");
      const nome = /aria-label="([^"]*)"/.exec(l.tag)![1];
      expect(l.tag).toContain(`data-dica="${nome}"`);
      expect(l.tag).toContain('data-dica-lado="direita"');
    }
  });

  // 28/10/2026: cheio na cor da área de uso (`bg-grupo-solid`); o item sem
  // área ("marca") é a cor principal, pelo `data-grupo="marca"` do globals.css.
  it("o ativo é cheio na cor da área, com o ícone branco", () => {
    rota.atual = "/tarefas";
    const aside = lateral(casco(true));
    const ativo = tagCom(aside, "Meu dia");
    expect(ativo).toContain('aria-current="page"');
    expect(ativo).toContain('data-grupo="marca"');
    expect(ativo).toContain("text-on-brand bg-grupo-solid");
    // O portal segue com o desenho de antes.
    expect(classeDoItem(true)).toContain("text-on-brand bg-brand-solid");
    const outro = tagCom(aside, "Início");
    expect(outro).not.toContain("aria-current");
    expect(outro).not.toContain("bg-grupo-solid");
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

  // Ajustes de 15/10 (G1): no topo, a marca do Connect levando ao Início, como
  // a logo da coluna aberta. Era o setor ativo abrindo a troca de setor, que
  // continua no botão do cabeçalho.
  it("no topo, a marca do Connect, que leva ao Início — sem a troca de setor", () => {
    const aside = lateral(casco(true));
    expect(aside).not.toContain("logo-horizontal");
    const marca = tagCom(aside, "Ir para o Início");
    expect(marca).toMatch(/^<a /);
    expect(marca).toContain('href="/home"');
    expect(marca).toContain('data-dica="Início"');
    expect(aside).toContain("/brand/symbol-color.svg");
    expect(aside).not.toContain("Trocar setor ou escritório");
  });

  it("a busca vira a lupa, com o atalho na dica", () => {
    const aside = lateral(casco(true));
    const lupa = tagCom(aside, "Buscar empresas, pessoas, telas…");
    expect(lupa).toMatch(/^<button/);
    expect(lupa).toContain('data-dica="Buscar (Ctrl K)"');
    expect(aside).not.toContain('placeholder="Buscar…"');
  });

  // Sem a bolinha da cor do setor desde 28/10/2026 (redundante com a cor da área).
  it("em Todos os setores, cada setor é o ícone dele, sem a bolinha da cor", () => {
    const aside = lateral(casco(true, { activeSector: null, activeSectorModules: [] }));
    const fiscal = aside.slice(aside.indexOf('aria-label="Fiscal"'));
    expect(fiscal.slice(0, fiscal.indexOf("</button>"))).toContain("lucide-receipt-text");
    expect(fiscal.slice(0, fiscal.indexOf("</button>"))).not.toContain("#C5374B");
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

// A regra do menu de 05/11/2026 (opção A): grupos por tema que abrem no lugar,
// a Tela 2 recuada sob a Tela 1 e as abas de dentro (GitHub) sem janela.
describe("menu do setor: grupos que abrem no lugar", () => {
  const SOCIETARIO = { code: "societario", label: "Societário", color: "#D44A3C" };
  const TECH = { code: "tech", label: "Tech", color: "#1A84C2" };
  const soc = [
    { code: "societario_licencas", label: "Licenças", href: "/licencas" },
    { code: "societario_certidoes", label: "Certidões", href: "/certidoes" },
    { code: "societario_painel", label: "Painel", href: "/processos/painel" },
    { code: "societario_processos", label: "Processos", href: "/processos" },
    { code: "societario_prazos", label: "Exigências e prazos", href: "/exigencias" },
  ];
  const botaoDoGrupo = (html: string, grupo: string) => {
    const m = new RegExp(`<button[^>]*aria-expanded="(true|false)"[^>]*>(?:(?!</button>)[\\s\\S])*?${grupo}`).exec(html);
    expect(m, `grupo "${grupo}"`).not.toBeNull();
    return m![0];
  };

  it("o grupo da tela aberta vem aberto, o outro fechado; a Tela 2 acende sozinha, recuada", () => {
    rota.atual = "/processos/painel";
    const aside = lateral(casco(false, { telasFixadas: [], activeSector: SOCIETARIO, activeSectorModules: soc }));
    expect(botaoDoGrupo(aside, "Operação")).toContain('aria-expanded="true"');
    expect(botaoDoGrupo(aside, "Licenças")).toContain('aria-expanded="false"');
    const painel = tagDoLink(aside, "Painel");
    expect(painel).toContain('aria-current="page"');
    expect(painel).toContain('data-recuado="true"');
    expect(tagDoLink(aside, "Processos")).not.toContain("aria-current");
    // O grupo fechado continua no HTML (o leitor de tela e o Ctrl+F acham), escondido.
    expect(aside).toMatch(/<div id="menu-grupo-licencas" hidden=""/);
  });

  it("GitHub sem janela: as abas recuadas embaixo, e só a aba aberta acende", () => {
    rota.atual = "/github/repositorios";
    const aside = lateral(casco(false, { telasFixadas: [], activeSector: TECH, podeGerirGithub: false, activeSectorModules: [
      { code: "tech_github_contributions", label: "GitHub", href: "/github" },
      { code: "tech_ops_center", label: "Ops Center", href: "/ops" },
    ] }));
    expect(aside).not.toContain('aria-haspopup="menu"');
    expect(tagDoLink(aside, "Repositórios")).toContain('aria-current="page"');
    expect(tagDoLink(aside, "GitHub")).not.toContain("aria-current");
    expect(aside).not.toContain(">Times<");
  });
});

// O Apoio do Geral (05/11/2026): Senhas, Manuais e Quadros num grupo do Geral,
// para todo setor; na Tech, os Quadros levam ao Controle interno.
describe("o Apoio no Geral", () => {
  const TECH = { code: "tech", label: "Tech", color: "#1A84C2" };

  it("Senhas, Manuais e Quadros no grupo Apoio, aberto na tela de um deles", () => {
    rota.atual = "/senhas";
    const aside = lateral(casco(false, { telasFixadas: [], apoioLigado: { senhas: true, manuais: true } }));
    expect(aside).toMatch(/<button[^>]*aria-expanded="true"[^>]*aria-controls="menu-grupo-apoio"/);
    expect(tagDoLink(aside, "Repositório de senhas")).toContain('aria-current="page"');
    expect(tagDoLink(aside, "Repositório de manuais")).toContain('href="/manuais"');
    expect(tagDoLink(aside, "Quadros")).toContain('href="/setor/dp"');
  });

  it("com o Apoio desligado, o Quadros fica sozinho, solto", () => {
    const aside = lateral(casco(false, { telasFixadas: [] }));
    expect(aside).not.toContain("menu-grupo-apoio");
    expect(tagDoLink(aside, "Quadros")).toContain('href="/setor/dp"');
  });

  it("na Tech, o Quadros leva ao Controle interno e não acende sozinho", () => {
    rota.atual = "/controle-interno";
    const aside = lateral(casco(false, { telasFixadas: [], activeSector: TECH, apoioLigado: { senhas: true, manuais: false }, activeSectorModules: [
      { code: "tech_controle_interno", label: "Controle interno", href: "/controle-interno" },
      { code: "tech_ceci", label: "Ceci", href: "/ceci" },
    ] }));
    const quadros = tagDoLink(aside, "Quadros");
    expect(quadros).toContain('href="/controle-interno"');
    expect(quadros).not.toContain("aria-current");
    expect(tagDoLink(aside, "Controle interno")).toContain('aria-current="page"');
  });

  it("o número dos Chamados aparece no item do Geral", () => {
    const aside = lateral(casco(false, { telasFixadas: [], chamadosLigados: true, chamadosNovos: 3 }));
    const chamados = linksDoMenu(aside).find((l) => l.texto.startsWith("Chamados"));
    expect(chamados?.texto).toContain("3");
  });
});

// Organizar menu (05/11/2026): a ordem do super admin vale no menu, e o link
// "Organizar menu" aparece só para ele.
describe("a ordem do menu escolhida", () => {
  const SOCIETARIO = { code: "societario", label: "Societário", color: "#D44A3C" };
  const soc = [
    { code: "societario_licencas", label: "Licenças", href: "/licencas" },
    { code: "societario_certidoes", label: "Certidões", href: "/certidoes" },
    { code: "societario_processos", label: "Processos", href: "/processos" },
    { code: "societario_prazos", label: "Exigências e prazos", href: "/exigencias" },
  ];
  const ordemDosGrupos = (html: string) => [...html.matchAll(/aria-controls="menu-grupo-([a-z-]+)"/g)].map((m) => m[1]);

  it("os grupos saem na ordem escolhida", () => {
    const padrao = lateral(casco(false, { telasFixadas: [], activeSector: SOCIETARIO, activeSectorModules: soc }));
    expect(ordemDosGrupos(padrao)).toEqual(["operacao", "licencas"]);
    const escolhida = lateral(casco(false, { telasFixadas: [], activeSector: SOCIETARIO, activeSectorModules: soc, ordemDoMenu: { grupos: ["Licenças"], telas: [] } }));
    expect(ordemDosGrupos(escolhida)).toEqual(["licencas", "operacao"]);
  });

  it("“Organizar menu” só para quem pode", () => {
    expect(lateral(casco(false, { telasFixadas: [], activeSector: SOCIETARIO, activeSectorModules: soc }))).not.toContain("Organizar menu");
    const aside = lateral(casco(false, { telasFixadas: [], activeSector: SOCIETARIO, activeSectorModules: soc, podeOrganizarMenu: true }));
    expect(tagDoLink(aside, "Organizar menu")).toContain('href="/admin/setores?setor=societario#ordem-do-menu"');
  });
});
