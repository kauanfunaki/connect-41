import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), show: vi.fn() }) }));
vi.mock("@/app/(app)/controle-interno/actions", () => ({ conferirCriterioTech: vi.fn() }));

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

describe("CriterioDeAceite", () => {
  it("mostra os rótulos, a data, os passos numerados e o Aprovado quando como lista de conferência", () => {
    const h = html();
    expect(h).toContain("Escrito em 10/11/2026");
    for (const rotulo of ["Mudança", "Onde testar", "Antes de testar", "Observação"]) expect(h).toContain(`>${rotulo}</dt>`);
    const lista = h.indexOf("<ol"), passo1 = h.indexOf("Abra um item."), passo2 = h.indexOf("Marque os pontos.");
    expect(lista).toBeGreaterThan(-1);
    expect(passo1).toBeGreaterThan(lista);
    expect(passo2).toBeGreaterThan(passo1);
    expect(caixas(h)).toHaveLength(2);
    expect(h).toContain("0 de 2 conferidos");
    // O comando recuado sai em bloco de código, sem o recuo.
    expect(h).toContain("<pre");
    expect(h).toContain("<code>npx prisma migrate deploy</code>");
    // "Antes de testar" com algo a fazer ganha o destaque de atenção.
    expect(h).toContain("bg-warning/8");
  });

  it("os pontos conferidos vêm marcados, com quem conferiu; tudo conferido diz como fechar", () => {
    const h = html({ marcas: { 1: { por: "Pessoa fictícia", quando: "10/11/2026, 14:32" }, 2: { por: "Outra pessoa", quando: "10/11/2026, 15:00" } } });
    expect(caixas(h).every(c => / checked=""/.test(c))).toBe(true);
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
