import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), show: vi.fn() }) }));
vi.mock("@/app/(app)/controle-interno/actions", () => ({ conferirCriterioTech: vi.fn(), conferirEntregaTech: vi.fn() }));

import { CriterioDeAceite } from "./CriterioDeAceite";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

// Texto fictício, no formato que a equipe escreve.
const CRITERIO = [
  "CRITÉRIO DE ACEITE (10/11/2026)",
  "Mudança: PR #10, com migration.",
  "Onde testar: produção › Controle interno.",
  "Antes de testar: rodar a migration antes do deploy:",
  "  npx prisma migrate deploy",
  "Passos:",
  "1. Abra um item.",
  "2. Marque os pontos.",
  "Aprovado quando:",
  "- O item abre em visualização.",
  "- A marca fica salva.",
  "Observação: nada mais.",
].join("\r\n");

type Props = React.ComponentProps<typeof CriterioDeAceite>;
const html = (extra: Partial<Props> = {}) => renderToStaticMarkup(React.createElement(CriterioDeAceite, { itemId: "i1", texto: CRITERIO, marcas: {}, podeEditar: true, editarHref: "/controle-interno/i1?editar=1", ...extra }));
const caixas = (h: string) => [...h.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(m => m[0]);
/** Só as caixas do "Aprovado quando". */
const doAprovado = (h: string) => caixas(h).filter(c => /id="tech-ponto-/.test(c));

describe("CriterioDeAceite", () => {
  it("mostra os rótulos, a data, os passos numerados e o Aprovado quando como lista de conferência", () => {
    const h = html();
    expect(h).toContain("Escrito em 10/11/2026");
    for (const rotulo of ["Mudança", "Onde testar", "Observação"]) expect(h).toContain(`>${rotulo}</dt>`);
    // O "Antes de testar" com algo a fazer é lista para marcar (11/11/2026).
    expect(h).toContain(">Antes de testar</h3>");
    const lista = h.indexOf("<ol"), passo1 = h.indexOf("Abra um item."), passo2 = h.indexOf("Marque os pontos.");
    expect(lista).toBeGreaterThan(-1);
    expect(passo1).toBeGreaterThan(lista);
    expect(passo2).toBeGreaterThan(passo1);
    expect(caixas(h)).toHaveLength(3);
    expect(doAprovado(h)).toHaveLength(2);
    expect(h).toContain("0 de 2 conferidos");
    expect(h).toContain("0 de 1 feito");
    // O comando recuado sai em bloco de código, sem o recuo.
    expect(h).toContain("<pre");
    expect(h).toContain("<code>npx prisma migrate deploy</code>");
    // "Antes de testar" com algo por fazer ganha o destaque de atenção.
    expect(h).toContain("border-warning/30");
  });

  it("os pontos conferidos vêm marcados, com quem conferiu; tudo conferido diz como fechar", () => {
    const h = html({ marcas: { 1: { por: "Pessoa fictícia", quando: "10/11/2026, 14:32" }, 2: { por: "Outra pessoa", quando: "10/11/2026, 15:00" } } });
    expect(doAprovado(h).every(c => / checked=""/.test(c))).toBe(true);
    expect(h).toContain("Conferido por Pessoa fictícia em 10/11/2026, 14:32");
    expect(h).toContain("2 de 2 conferidos");
    expect(h).toContain("Tudo conferido");
  });

  it("quem só vê o módulo vê as marcas, sem poder marcar", () => {
    const h = html({ podeEditar: false, marcas: { 2: { por: "Pessoa fictícia", quando: "10/11/2026, 14:32" } } });
    expect(caixas(h).every(c => / disabled=""/.test(c))).toBe(true);
    expect(caixas(h).filter(c => / checked=""/.test(c))).toHaveLength(1);
    expect(h).not.toContain("Escrever o critério");
  });

  it("linhas com \"- \" num campo saem como lista, sem o hífen; o resto continua parágrafo", () => {
    const h = html({ texto: ["Observação:", "- Merge e deploy do #10.", "- Conferir o token no painel.", "Depois disso, abra a tela.", "Passos:", "1. Abra."].join("\n") });
    const lista = /<ul class="[^"]*list-disc[^"]*">(.*?)<\/ul>/.exec(h);
    expect(lista?.[1]).toBe("<li class=\"break-words [overflow-wrap:anywhere]\">Merge e deploy do #10.</li><li class=\"break-words [overflow-wrap:anywhere]\">Conferir o token no painel.</li>");
    expect(h).not.toContain("- Merge");
    expect(h).toContain(">Depois disso, abra a tela.</p>");
  });

  // funcionalidade-579 (11/11/2026).
  it("Antes de testar: cada ponto se marca, e as conferências do PR vêm no topo, só de leitura", () => {
    const texto = ["Antes de testar:", "- Ligar o módulo.", "- Rodar o script.", "Aprovado quando:", "- a"].join("\n");
    const h = html({
      texto,
      marcasDoPreparo: { 1: { por: "Pessoa fictícia", quando: "11/11/2026, 09:00" } },
      automaticas: [
        { chave: "pr", rotulo: "PR mergeado", marca: { por: "Pessoa fictícia", quando: "11/11/2026, 10:00" } },
        { chave: "no-ar", rotulo: "No ar: o merge está no deploy de produção", marca: null },
      ],
    });
    expect(h).toContain("2 de 4 feitos");
    expect(h).toContain("Feito por Pessoa fictícia em 11/11/2026, 09:00");
    expect(h).toContain("Conferido pelo Connect em 11/11/2026, 10:00, a pedido de Pessoa fictícia");
    expect(h).toContain("use o Conferir, junto ao PR");
    const automaticas = caixas(h).filter(c => /id="tech-auto-/.test(c));
    expect(automaticas).toHaveLength(2);
    expect(automaticas.every(c => / disabled=""/.test(c))).toBe(true);
    // A ordem: PR, no ar e depois os pontos escritos.
    expect(h.indexOf("PR mergeado")).toBeLessThan(h.indexOf("Ligar o módulo."));
  });

  it("sem \"Antes de testar\" no critério, as conferências do PR entram antes dos passos", () => {
    const h = html({ texto: "Passos:\n1. Abra.\nAprovado quando:\n- a", automaticas: [{ chave: "pr", rotulo: "PR mergeado", marca: null }] });
    expect(h.indexOf(">Antes de testar</h3>")).toBeGreaterThan(-1);
    expect(h.indexOf(">Antes de testar</h3>")).toBeLessThan(h.indexOf(">Passos</h3>"));
    const semCriterio = html({ texto: null, automaticas: [{ chave: "pr", rotulo: "PR mergeado", marca: null }] });
    expect(semCriterio).toContain("ainda não tem critério de aceite");
    expect(semCriterio).toContain("PR mergeado");
  });

  it("texto fora do formato aparece como texto simples", () => {
    const h = html({ texto: "Testar a tela e ver se salva." });
    expect(h).toContain("Testar a tela e ver se salva.");
    expect(caixas(h)).toHaveLength(0);
    expect(h).not.toContain("<dl");
  });

  it("sem critério, diz o que falta e leva ao campo na edição", () => {
    const h = html({ texto: null });
    expect(h).toContain("ainda não tem critério de aceite");
    expect(h).toContain('href="/controle-interno/i1?editar=1#tech-criteria"');
    expect(html({ texto: "  ", podeEditar: false })).not.toContain("Escrever o critério");
  });
});
