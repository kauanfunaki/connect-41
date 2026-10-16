import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AGENT_CATALOG, agenteDoCatalogo } from "@/lib/ia/catalogo";
import { descreverProposta, rotulosDaDecisao } from "@/lib/ia/chat/regras";
import { especialidadeDoAgente } from "@/lib/ia/ceci";
import { CAMPOS_DO_SITE_PADRAO, montarPlanosDoSite, setoresDoSobMedida, type PlanoDoBanco } from "@/lib/planos/site-regras";
import { linksDoSite } from "@/lib/site/links";
import { CONVERSAS_DA_CECI } from "./conversasDaCeci";
import { gradeDosCartoes } from "./SecaoDePlanos";
import { SiteDoConnect } from "./SiteDoConnect";

// O site de apresentação, versão 3 (13/10/2026). Sem navegador, a estrutura que
// o Kauan pediu fica conferida no HTML: o topo com logo, âncoras e o botão de
// entrar; um botão só na primeira dobra; a Ceci em cada setor, com o Portal
// do Cliente "em breve"; e nenhum rótulo com espaço a mais.

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const links = linksDoSite("https://app.useconnect.com.br");
const pagina = (temSessao = false, planos: Parameters<typeof SiteDoConnect>[0]["planos"] = null) =>
  renderToStaticMarkup(React.createElement(SiteDoConnect, { links, temSessao, planos }));

/** Do início da tag que contém `marca` até o fechamento `</tag>` seguinte. */
function trecho(html: string, marca: string, tag: string): string {
  const inicio = html.indexOf(marca);
  expect(inicio).toBeGreaterThanOrEqual(0);
  return html.slice(inicio, html.indexOf(`</${tag}>`, inicio));
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
const vezes = (html: string, destino: string) => hrefs(html).filter((h) => h === destino).length;

describe("site do Connect", () => {
  // Pedido do Kauan (13/10): gente da 41 não achou como entrar e desceu até o
  // rodapé. O topo volta a ter "Logo | Navegação | Entrar no Connect".
  it("o topo tem o logo, as âncoras das seções e o botão de entrar da equipe", () => {
    const html = pagina();
    const topo = trecho(html, "<header", "header");
    expect(hrefs(topo)).toEqual(["#inicio", "#ceci", "#o-connect", "#seguranca", "#sobre-nos", "#perguntas", links.entrar]);
    for (const ancora of hrefs(topo).filter((h) => h.startsWith("#"))) expect(html).toContain(`id="${ancora.slice(1)}"`);
    expect(topo).toContain(">Entrar no Connect<");
  });

  it("com a sessão da equipe no navegador, o botão diz Abrir o Connect e leva ao /home", () => {
    const html = pagina(true);
    const topo = trecho(html, "<header", "header");
    expect(hrefs(topo)).toContain(links.abrir);
    expect(hrefs(topo)).not.toContain(links.entrar);
    expect(topo).toContain(">Abrir o Connect<");
    // A porta "Sou da equipe" acompanha; o rodapé segue com o login.
    expect(vezes(html, links.abrir)).toBe(2);
    expect(vezes(html, links.entrar)).toBe(1);
  });

  // O portal não vai para o topo: fica na porta e na lista de links do
  // rodapé. A entrada da equipe está nos três.
  it("o portal aparece só na porta e no rodapé; a entrada da equipe, também no topo", () => {
    const html = pagina();
    const portas = hrefs(trecho(html, 'aria-label="Por onde entrar"', "section"));
    expect(portas).toEqual([links.portal, links.entrar]);
    const rodape = hrefs(trecho(html, "<footer", "footer"));
    expect(vezes(html, links.portal)).toBe(2);
    expect(rodape).toContain(links.portal);
    expect(vezes(html, links.entrar)).toBe(3);
  });

  // Decisão do Kauan (13/10): o portal de vagas é da 41, com endereço próprio
  // (o 41 Carreiras) — o site do Connect fica só com "Sou cliente" e "Sou da
  // equipe", sem a porta nem o link das vagas. O assistente do WhatsApp do
  // Recrutamento, que é do Connect, continua.
  it("nenhuma porta nem link de vagas; o assistente do Recrutamento continua", () => {
    const html = pagina();
    const portas = trecho(html, 'aria-label="Por onde entrar"', "section");
    expect(portas).toContain(">Sou cliente<");
    expect(portas).toContain(">Sou da equipe<");
    expect(portas).not.toContain("Quero trabalhar aqui");
    expect(portas).toContain("md:grid-cols-2");
    expect(hrefs(html).some((h) => h.includes("/carreiras"))).toBe(false);
    expect(trecho(html, "<footer", "footer")).not.toContain(">Vagas<");
    expect(html).not.toContain("Ver vagas");
    expect(html).toContain("Um número próprio do Recrutamento");
  });

  it("a primeira dobra tem um botão só, que desce para a Ceci", () => {
    const dobra = trecho(pagina(), 'aria-labelledby="site-titulo"', "section");
    expect(hrefs(dobra)).toEqual(["#ceci"]);
    expect(dobra).toContain("Conhecer o Connect");
  });

  it("a Ceci aparece em cada setor, em abas ligadas aos painéis, e o Portal do Cliente como em breve", () => {
    const ceci = trecho(pagina(), 'id="ceci"', "section");
    for (const c of CONVERSAS_DA_CECI) expect(ceci).toContain(`>${c.setor}<`);
    expect(ceci).toContain(">Em breve<");
    expect(ceci).toContain(">Em breve no Portal do Cliente<");
    const abas = [...ceci.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"/g)].map((m) => m[1]!);
    expect(abas).toHaveLength(CONVERSAS_DA_CECI.length);
    for (const painel of abas) expect(ceci).toContain(`id="${painel}"`);
    // Chega parada no primeiro setor: uma aba escolhida e nenhum relógio de troca.
    expect(ceci.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(ceci).not.toContain("c41-site-progresso");
  });

  it("nada de prometer que a IA substitui alguém", () => {
    expect(pagina().toLowerCase()).not.toMatch(/substitu/);
  });

  it("as perguntas frequentes abrem por botão, começam fechadas e já trazem a resposta no HTML", () => {
    const perguntas = trecho(pagina(), 'id="perguntas"', "section");
    const botoes = [...perguntas.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    expect(botoes.length).toBeGreaterThanOrEqual(6);
    for (const botao of botoes) {
      expect(botao).toContain('aria-expanded="false"');
      const alvo = /aria-controls="([^"]+)"/.exec(botao)?.[1];
      expect(Boolean(alvo && perguntas.includes(`id="${alvo}"`))).toBe(true);
    }
    expect(perguntas).toContain("Ainda não. Hoje a Ceci atende a equipe do escritório.");
  });

  // O "Entrar   no Connect" da primeira versão: rótulo partido em dois itens de
  // um botão `inline-flex` com `gap` (ver components/site/estilos).
  it("nenhum texto com espaço duro ou espaço a mais", () => {
    for (const html of [pagina(), pagina(true)]) {
      expect(html).not.toContain("&nbsp;");
      expect(html).not.toContain(" ");
      const textos = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1]!);
      expect(textos.filter((t) => /\s{2,}/.test(t))).toEqual([]);
    }
    expect(pagina()).toContain(">Entrar no Connect<");
  });

  it("as integrações vão só pelo nome, sem imagem de terceiro", () => {
    const html = pagina();
    for (const nome of ["Omie", "SPED", "WhatsApp", "Google Agenda"]) expect(html).toContain(`>${nome}<`);
    const imagens = [...html.matchAll(/<img[^>]*src="([^"]*)"/g)].map((m) => m[1]!);
    expect(imagens.every((src) => src.startsWith("/brand/"))).toBe(true);
  });
});

// A seção Planos (14/10/2026, escolha A do Kauan): os planos marcados "Mostrar
// no site", entre O Connect e Segurança (subiu no mesmo dia, para ganhar
// destaque), com o link "Planos" no topo. Sem preço por enquanto (decisão do
// Kauan); pronta para mostrar quando ligarem. Depois dos planos, o cartão
// "Connect sob medida", que nunca tem preço.
describe("a seção Planos do site", () => {
  const plano = (id: string, name: string, extra: Partial<PlanoDoBanco> = {}): PlanoDoBanco => ({
    id,
    name,
    managementMode: "MANAGED",
    billingType: "FLAT_MONTHLY",
    basePrice: "1500.00",
    pricePerUser: null,
    setupFee: "3000.00",
    allowedModuleCodes: null,
    active: true,
    ...extra,
  });
  const PLANOS = [
    plano("ger", "Gerenciado"),
    plano("auto", "Autoatendimento", {
      managementMode: "SELF_SERVICE",
      billingType: "PER_USER_MONTHLY",
      pricePerUser: "89.90",
      allowedModuleCodes: ["bpo_dre", "recrutamento_vagas"],
    }),
  ];
  const noSite = new Map([
    ["ger", { ...CAMPOS_DO_SITE_PADRAO, mostrarNoSite: true, ordem: 1 }],
    ["auto", { ...CAMPOS_DO_SITE_PADRAO, mostrarNoSite: true, ordem: 2, destaques: ["Suporte da 41 Tech"] }],
  ]);
  const comPlanos = (mostrarPrecos = false, cartaoSobMedida = true) =>
    pagina(false, montarPlanosDoSite(PLANOS, noSite, mostrarPrecos, cartaoSobMedida));
  /** O cartão sob medida: o último da lista, até a faixa "Em todos". */
  const sobMedida = (html: string) => {
    const inicio = html.indexOf('data-cartao="sob-medida"');
    expect(inicio).toBeGreaterThanOrEqual(0);
    return html.slice(inicio, html.indexOf(">Em todos<", inicio));
  };

  it("sem planos (ou sem banco), nem seção nem link no topo — e nem o cartão sob medida, que não aparece sozinho", () => {
    const html = pagina();
    expect(html).not.toContain('id="planos"');
    expect(hrefs(html)).not.toContain("#planos");
    expect(html).not.toContain("Connect sob medida");
  });

  // Pedido do Kauan (14/10): Planos antes de Segurança, para ganhar destaque.
  it("com planos, a seção fica entre O Connect e Segurança, e o link Planos vem antes de Segurança no topo e no rodapé", () => {
    const html = comPlanos();
    const ordem = ["#ceci", "#o-connect", "#planos", "#seguranca", "#sobre-nos", "#perguntas"];
    expect(hrefs(trecho(html, "<header", "header"))).toEqual(["#inicio", ...ordem, links.entrar]);
    expect(hrefs(trecho(html, 'aria-label="Nesta página"', "nav"))).toEqual(ordem);
    const posicao = (id: string) => html.indexOf(`id="${id}"`);
    expect(posicao("o-connect")).toBeLessThan(posicao("planos"));
    expect(posicao("planos")).toBeLessThan(posicao("seguranca"));
    expect(posicao("seguranca")).toBeLessThan(posicao("sobre-nos"));
  });

  it("sem preço por padrão: Valor sob consulta, e nenhum R$ na seção", () => {
    const secao = trecho(comPlanos(), 'id="planos"', "section");
    expect(secao).toContain(">Gerenciado<");
    expect(secao).toContain(">Autoatendimento<");
    expect(secao.match(/>Valor sob consulta</g)).toHaveLength(2);
    expect(secao).not.toContain("R$");
    expect(secao).not.toContain("implantação");
  });

  it("cada cartão: para quem é, os setores do plano, os destaques e o Fale com a gente pelo e-mail do site", () => {
    const secao = trecho(comPlanos(), 'id="planos"', "section");
    expect(secao).toContain("A 41 Tech administra o Connect pelo seu escritório");
    expect(secao).toContain(">Suporte da 41 Tech<");
    // O Gerenciado libera o catálogo inteiro: seis setores e o resto em "+N setores".
    expect(secao).toMatch(/>\+\d setores</);
    const contato = hrefs(secao).filter((h) => h.startsWith("mailto:"));
    expect(contato).toEqual([
      "mailto:marcos@41contabil.com.br?subject=Plano%20Gerenciado",
      "mailto:marcos@41contabil.com.br?subject=Plano%20Autoatendimento",
      "mailto:marcos@41contabil.com.br?subject=Connect%20sob%20medida",
    ]);
    expect(secao.match(/>Fale com a gente</g)).toHaveLength(2);
    // O que vale para todos.
    for (const t of ["Permissões por setor", "Registro de quem fez o quê", "Cada escritório com os seus dados"]) expect(secao).toContain(`>${t}<`);
  });

  it("com o interruptor ligado, o preço entra no lugar do Valor sob consulta", () => {
    const secao = trecho(comPlanos(true), 'id="planos"', "section");
    expect(secao).not.toContain("Valor sob consulta");
    expect(secao).toContain(">R$ 1.500,00<");
    expect(secao).toContain(">por mês, valor fixo<");
    expect(secao).toContain(">R$ 89,90<");
    expect(secao).toContain(">por usuário/mês<");
    expect(secao).toContain(">+ implantação de R$ 3.000,00<");
  });

  // Pedido do Kauan (14/10): contratar o Connect com um ou dois setores, os
  // que quiser — um cartão que não é plano e não tem preço.
  it("o cartão Connect sob medida vem depois dos planos, com os setores do catálogo para escolher e o Montar meu plano", () => {
    const html = comPlanos();
    const cartao = sobMedida(html);
    expect(html.indexOf(">Autoatendimento<")).toBeLessThan(html.indexOf('data-cartao="sob-medida"'));
    expect(cartao).toContain(">Connect sob medida<");
    expect(cartao).toContain("Para quem quer começar por um ou dois setores");
    for (const d of ["Comece com um setor e acrescente outros quando quiser", "Mesma segurança e suporte dos outros planos"]) {
      expect(cartao).toContain(`>${d}<`);
    }
    expect(cartao).toContain(">Valor conforme os módulos<");
    // Uma etiqueta por setor do catálogo que tem módulo; cada uma é um botão de
    // ligar e desligar, e a página chega sem nada escolhido.
    expect(cartao).toContain(">Escolha os setores que te interessam<");
    const etiquetas = [...cartao.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>/g)];
    const setores = setoresDoSobMedida();
    expect(etiquetas).toHaveLength(setores.length);
    expect(etiquetas.every((e) => e[1] === "false" && e[0].includes('type="button"'))).toBe(true);
    for (const s of setores) expect(cartao).toContain(`${s.rotulo}</button>`);
    // O botão: o e-mail do site, com o assunto e — sem escolha, como sem JavaScript — sem corpo.
    expect(hrefs(cartao)).toEqual(["mailto:marcos@41contabil.com.br?subject=Connect%20sob%20medida"]);
    expect(cartao).toContain(">Montar meu plano<");
    // Distinto dos planos: borda tracejada, não o cartão cheio.
    expect(cartao).toContain("border-dashed");
  });

  it("o cartão sob medida nunca tem preço, nem com o interruptor dos preços ligado", () => {
    for (const html of [comPlanos(false), comPlanos(true)]) {
      const cartao = sobMedida(html);
      expect(cartao).not.toContain("R$");
      expect(cartao).not.toMatch(/sob consulta|por mês|por usuário|implantação/);
      expect(cartao).toContain(">Valor conforme os módulos<");
    }
  });

  it("o Super Admin escondeu o cartão: a seção fica só com os planos", () => {
    const html = comPlanos(false, false);
    expect(html).toContain('id="planos"');
    expect(html).not.toContain('data-cartao="sob-medida"');
    expect(html).not.toContain("Connect sob medida");
    expect(trecho(html, 'id="planos"', "section")).toContain(">Fale com a gente<");
  });

  // Retorno do Kauan (14/10): a faixa esticada na largura toda deixava
  // buracos desiguais. Agora ela tem o tamanho do conteúdo, no meio.
  it("a faixa Em todos: o rótulo e os três itens numa lista, no meio, sem a grade que esticava", () => {
    const secao = trecho(comPlanos(), 'id="planos"', "section");
    const faixa = secao.slice(secao.lastIndexOf('<div class="c41-site-surge', secao.indexOf(">Em todos<")));
    expect(faixa).toContain("justify-center");
    expect(faixa).not.toMatch(/grid-cols/);
    const itens = [...faixa.matchAll(/<li[^>]*>.*?<\/li>/g)].map((m) => m[0]);
    expect(itens).toHaveLength(3);
    for (const [i, t] of ["Permissões por setor", "Registro de quem fez o quê", "Cada escritório com os seus dados"].entries()) {
      expect(itens[i]).toContain(`>${t}<`);
      // Item não parte no meio do texto quando os três estão lado a lado.
      expect(itens[i]).toContain("sm:whitespace-nowrap");
    }
    // Numa linha só no computador grande, com o fio entre os itens.
    expect(faixa).toContain("xl:flex-row");
    expect(faixa).toContain("xl:divide-x");
  });

  it("os textos da seção também sem espaço duro nem espaço a mais", () => {
    for (const html of [comPlanos(), comPlanos(true), comPlanos(false, false)]) {
      expect(html).not.toContain(" ");
      expect(html).not.toContain("&nbsp;");
      const textos = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1]!);
      expect(textos.filter((t) => /\s{2,}/.test(t))).toEqual([]);
    }
  });
});

describe("as colunas dos cartões de Planos", () => {
  it("dois planos e o sob medida: três no computador; no tablet, dois em cima e o sob medida na linha de baixo inteira", () => {
    expect(gradeDosCartoes(2, true)).toEqual({ lista: "md:grid-cols-2 lg:grid-cols-3", sobMedida: "md:col-span-2 lg:col-span-1" });
  });

  it("um plano e o sob medida: lado a lado", () => {
    expect(gradeDosCartoes(1, true)).toEqual({ lista: "md:grid-cols-2", sobMedida: "" });
  });

  it("três planos e o sob medida: dois por linha", () => {
    expect(gradeDosCartoes(3, true)).toEqual({ lista: "md:grid-cols-2", sobMedida: "" });
  });

  it("quatro planos e o sob medida: o sob medida completa a linha de baixo", () => {
    expect(gradeDosCartoes(4, true)).toEqual({ lista: "md:grid-cols-2 lg:grid-cols-3", sobMedida: "md:col-span-2 lg:col-span-2" });
  });

  it("sem o cartão sob medida, as colunas de antes", () => {
    expect(gradeDosCartoes(1, false).lista).toBe("md:max-w-[40rem]");
    expect(gradeDosCartoes(2, false).lista).toBe("md:grid-cols-2");
    expect(gradeDosCartoes(3, false).lista).toBe("md:grid-cols-2 lg:grid-cols-3");
  });
});

// A seção da Ceci só promete o que existe. Se um agente mudar, estes testes
// lembram de mudar o site junto.
describe("as conversas da Ceci no site", () => {
  const conversa = (chave: string) => CONVERSAS_DA_CECI.find((c) => c.chave === chave)!;

  it("um setor para cada agente do chat, e o Portal do Cliente sem conversa", () => {
    const agentes: Record<string, string> = {
      bpo: "assistente_do_bpo",
      fiscal: "assistente_do_fiscal",
      dp: "assistente_do_dp",
      societario: "assistente_do_societario",
      recrutamento: "assistente_do_recrutamento",
    };
    for (const c of CONVERSAS_DA_CECI) {
      if (c.chave === "portal") {
        expect(c.emBreve).toBe(true);
        expect(c.pergunta).toBeUndefined();
        continue;
      }
      expect(agenteDoCatalogo(agentes[c.chave]!)).not.toBeNull();
      expect(Boolean(c.pergunta && c.resposta && c.consulta.length > 0)).toBe(true);
      // O setor embaixo do nome dela é o mesmo do chat ("BPO", e não "BPO Financeiro", desde 13/10/2026).
      expect(c.setor, c.chave).toBe(especialidadeDoAgente(agentes[c.chave]!));
    }
  });

  // "Não altera nada sozinha": os agentes do chat de cada setor não gravam.
  it("os agentes do chat dos setores só leem ou propõem", () => {
    for (const code of ["assistente_do_bpo", "assistente_do_fiscal", "assistente_do_dp", "assistente_do_societario", "assistente_do_recrutamento"]) {
      expect(agenteDoCatalogo(code)?.escreve).toBe(false);
    }
  });

  // Quando a Ceci chegar ao portal, este teste cai — e o "Em breve" sai do site.
  it("ainda não há agente no Portal do Cliente", () => {
    expect(AGENT_CATALOG.some((a) => /portal/.test(a.code) || a.sectorCode === "portal")).toBe(false);
  });

  it("os cartões de sugestão dizem o mesmo que os do chat", () => {
    const aspasRetas = (s: string) => s.replace(/[“”]/g, '"');
    const societario = conversa("societario").proposta!;
    expect(aspasRetas(societario.texto)).toBe(
      descreverProposta({
        ferramenta: "propor_concluir_etapa",
        descricao: "",
        argumentos: { motivo: "checklist completo" },
        alvo: "Assinatura dos sócios",
      })
    );
    expect(rotulosDaDecisao("propor_concluir_etapa")).toEqual({ sim: societario.sim, nao: societario.nao });

    const recrutamento = conversa("recrutamento").proposta!;
    expect(recrutamento.texto).toBe(
      descreverProposta({ ferramenta: "propor_mover_etapa", descricao: "", argumentos: { etapa: "ENTREVISTA" }, alvo: "Ana Ribeiro" })
    );
    expect(rotulosDaDecisao("propor_mover_etapa")).toEqual({ sim: recrutamento.sim, nao: recrutamento.nao });

    // No BPO, no Fiscal e no DP ela só lê: nenhum cartão de sugestão.
    for (const chave of ["bpo", "fiscal", "dp"]) expect(conversa(chave).proposta).toBeUndefined();
  });
});
