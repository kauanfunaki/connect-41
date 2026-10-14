import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AGENT_CATALOG, agenteDoCatalogo } from "@/lib/ia/catalogo";
import { descreverProposta, rotulosDaDecisao } from "@/lib/ia/chat/regras";
import { especialidadeDoAgente } from "@/lib/ia/ligia";
import { linksDoSite } from "@/lib/site/links";
import { CONVERSAS_DA_LIGIA } from "./conversasDaLigia";
import { SiteDoConnect } from "./SiteDoConnect";

// O site de apresentação, versão 3 (13/10/2026). Sem navegador, a estrutura que
// o Kauan pediu fica conferida no HTML: o topo com logo, âncoras e o botão de
// entrar; um botão só na primeira dobra; a Lígia em cada setor, com o Portal
// do Cliente "em breve"; e nenhum rótulo com espaço a mais.

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const links = linksDoSite("https://app.useconnect.com.br");
const pagina = (temSessao = false) => renderToStaticMarkup(React.createElement(SiteDoConnect, { links, temSessao }));

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
    expect(hrefs(topo)).toEqual(["#inicio", "#ligia", "#o-connect", "#seguranca", "#sobre-nos", "#perguntas", links.entrar]);
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

  it("a primeira dobra tem um botão só, que desce para a Lígia", () => {
    const dobra = trecho(pagina(), 'aria-labelledby="site-titulo"', "section");
    expect(hrefs(dobra)).toEqual(["#ligia"]);
    expect(dobra).toContain("Conhecer o Connect");
  });

  it("a Lígia aparece em cada setor, em abas ligadas aos painéis, e o Portal do Cliente como em breve", () => {
    const ligia = trecho(pagina(), 'id="ligia"', "section");
    for (const c of CONVERSAS_DA_LIGIA) expect(ligia).toContain(`>${c.setor}<`);
    expect(ligia).toContain(">Em breve<");
    expect(ligia).toContain(">Em breve no Portal do Cliente<");
    const abas = [...ligia.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"/g)].map((m) => m[1]!);
    expect(abas).toHaveLength(CONVERSAS_DA_LIGIA.length);
    for (const painel of abas) expect(ligia).toContain(`id="${painel}"`);
    // Chega parada no primeiro setor: uma aba escolhida e nenhum relógio de troca.
    expect(ligia.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(ligia).not.toContain("c41-site-progresso");
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
    expect(perguntas).toContain("Ainda não. Hoje a Lígia atende a equipe do escritório.");
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

// A seção da Lígia só promete o que existe. Se um agente mudar, estes testes
// lembram de mudar o site junto.
describe("as conversas da Lígia no site", () => {
  const conversa = (chave: string) => CONVERSAS_DA_LIGIA.find((c) => c.chave === chave)!;

  it("um setor para cada agente do chat, e o Portal do Cliente sem conversa", () => {
    const agentes: Record<string, string> = {
      bpo: "assistente_do_bpo",
      fiscal: "assistente_do_fiscal",
      dp: "assistente_do_dp",
      societario: "assistente_do_societario",
      recrutamento: "assistente_do_recrutamento",
    };
    for (const c of CONVERSAS_DA_LIGIA) {
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

  // Quando a Lígia chegar ao portal, este teste cai — e o "Em breve" sai do site.
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
